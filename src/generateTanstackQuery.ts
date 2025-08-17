import path from "path";
import { Project, ProjectOptions, SourceFile, SyntaxKind } from "ts-morph";

const initProject = (config: ProjectOptions) => {
  return new Project(config);
};

const generateRequireImports = (
  generatedHooksFile: SourceFile,
  outDir: string,
) => {
  // Add imports for all the generated APIs
  generatedHooksFile.addStatements(`
  // This is an auto-generated file. Do not edit manually, instead run the generate.bash`);
  generatedHooksFile.addImportDeclaration({
    namedImports: ["useQuery", "useMutation"],
    moduleSpecifier: `@tanstack/react-query`,
  });

  generatedHooksFile.addImportDeclaration({
    namedImports: [
      "UseQueryOptions",
      "UseQueryResult",
      "UseMutationOptions",
      "UseMutationResult",
    ],
    isTypeOnly: true,
    moduleSpecifier: `@tanstack/react-query`,
  });
  generatedHooksFile.addImportDeclaration({
    namedImports: ["RawAxiosRequestConfig", " AxiosResponse"],
    isTypeOnly: true,
    moduleSpecifier: "axios",
  });

  generatedHooksFile.addImportDeclaration({
    namedImports: ["Configuration"],
    moduleSpecifier: path.resolve(
      process.cwd(),
      outDir,
      "axios",
      "configuration.ts",
    ),
  });
};

const createTanstackHooks = (outDir: string, config: ProjectOptions): void => {
  const project = initProject(config);

  const generatedAxiosClientFile = project.addSourceFileAtPath(
    path.resolve(process.cwd(), outDir, "axios", "api.ts"),
  );
  const generatedHooksFile = project.createSourceFile(
    path.resolve(process.cwd(), outDir, "generatedHooks.ts"),
    ``,
    {
      overwrite: true,
    },
  );
  generateRequireImports(generatedHooksFile, outDir);

  const generatedHookNames: string[] = [];
  const importedTypes = new Set<string>();
  const apiFactoryFunctions = generatedHooksFile
    .getVariableDeclarations()
    .filter(
      (v) => v.isExported() && v.getName().endsWith("ControllerApiFactory"),
    );

  for (const apiFactory of apiFactoryFunctions) {
    generatedHooksFile.addImportDeclaration({
      namedImports: [apiFactory.getName()],
      moduleSpecifier: `../generated/axios/${apiFactory.getSourceFile().getBaseName()}`,
    });

    // Get the paramCreator for the controller, as that contains information on the METHOD type, which we need

    const axiosParamCreatorName =
      apiFactory.getName().replace("Factory", "") + "AxiosParamCreator";
    const paramCreatorFunction =
      generatedHooksFile.getVariableDeclarationOrThrow(
        (v) => v.isExported() && v.getName() === axiosParamCreatorName,
      );

    const returnStatement = paramCreatorFunction?.getDescendantsOfKind(
      SyntaxKind.ReturnStatement,
    )[0];
    if (!returnStatement) throw new Error("Return statement not found");
    const objExpr = returnStatement.getExpressionIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression,
    );
    const properties = objExpr.getProperties();

    const endpointMethodNames = properties.map((p) =>
      p.asKind(SyntaxKind.PropertyAssignment)?.getName(),
    );
    // This handsome fellow traverses the AST to find the endpoint method names
    const endpointMethodRequestMethods = properties.map((p) => {
      const initializer = p
        .asKind(SyntaxKind.PropertyAssignment)
        ?.getInitializerOrThrow()
        .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
        .find((v) => v.getName() === "localVarRequestOptions")
        ?.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression)
        .getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializer();

      return initializer?.getKind() === SyntaxKind.StringLiteral
        ? initializer.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralText()
        : initializer?.getText();
    });
    const endpointMethodReturnTypes = apiFactory
      .getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement)
      .getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);

    const isPrimitive = (typeName: string) =>
      [
        "string",
        "number",
        "boolean",
        "unknown",
        "any",
        "void",
        "null",
        "undefined",
      ].includes(typeName.toLowerCase());

    const isMutation = (methodName: string) =>
      ["post", "put", "patch", "delete"].includes(methodName.toLowerCase());

    for (let i = 0; i < endpointMethodNames.length; i++) {
      const endpointMethodName = endpointMethodNames[i] as string;
      const endpointMethodRequestMethod = endpointMethodRequestMethods[
        i
      ] as string;

      // When getting the return type, we need to RECURSIVELY CHECK the type arguments, as they can be nested
      // This needs to be fixed, but should be good enough for now. Currently this is pretty shitty and only works for the first level of type arguments.
      const typeArgs = sanitizeTypeText(
        endpointMethodReturnTypes
          .getPropertyOrThrow(endpointMethodName)
          .asKindOrThrow(SyntaxKind.MethodDeclaration)
          .getReturnType()
          .getTypeArguments()[0]
          .getTypeArguments()[0]
          .getText(),
      );

      if (!isPrimitive(typeArgs)) {
        importedTypes.add(onlyAlphanumeric(typeArgs));
      }

      const endpointParameterNamesAndTypesText: {
        name: string;
        type: string;
      }[] = [];

      const endpointParameterNamesAndTypesTextParameter =
        endpointMethodReturnTypes
          .getPropertyOrThrow(endpointMethodName)
          .asKindOrThrow(SyntaxKind.MethodDeclaration)
          .getParameters();
      for (const param of endpointParameterNamesAndTypesTextParameter) {
        // All the params before are the parameters we actually use
        if (param.getName() == "options") break;
        const paramName = param.getName();
        const paramType = sanitizeTypeText(param.getType().getText());
        endpointParameterNamesAndTypesText.push({
          name: paramName,
          type: paramType,
        });
      }

      for (const param of endpointParameterNamesAndTypesText) {
        if (!isPrimitive(param.type)) {
          importedTypes.add(param.type);
        }
      }

      //Note: A bit unsure with hasQuestionToken. Seems to be best to default to requried.
      const extraHookParameters = endpointParameterNamesAndTypesText.map(
        (param) => {
          return {
            name: param.name,
            type: param.type,
            hasQuestionToken: false,
          };
        },
      );

      const hookName = `use${endpointMethodName[0].toUpperCase()}${endpointMethodName.slice(1)}`;
      generatedHookNames.push(hookName);

      if (isMutation(endpointMethodRequestMethod)) {
        generatedHooksFile.addFunction({
          name: hookName,
          isExported: true,
          parameters: [
            ...extraHookParameters,
            {
              name: "options",
              type: "RawAxiosRequestConfig",
              hasQuestionToken: true,
            },
            {
              name: "mutationOptions",
              type: `Omit<UseMutationOptions< AxiosResponse<${typeArgs}>, Error, unknown>, 'mutationFn'>`,
              hasQuestionToken: true,
            },
          ],
          returnType: `UseMutationResult<AxiosResponse<${typeArgs}>, Error>`,
          statements: `
  return useMutation<AxiosResponse<${typeArgs}>, Error, unknown>({
    mutationFn: async () => {
      const api = ${apiFactory.getName()}(new Configuration({ basePath: \`\${import.meta.env.VITE_BACKEND_URL}\` }));
      const res = await api.${endpointMethodName}(${extraHookParameters.map((p) => p.name).join(", ")}${extraHookParameters.length > 0 ? ", " : ""}{...options, withCredentials: true});
      return res;
    },
    ...mutationOptions
  });
    `,
        });
      } else {
        generatedHooksFile.addFunction({
          name: hookName,
          isExported: true,
          parameters: [
            ...extraHookParameters,
            {
              name: "options",
              type: "RawAxiosRequestConfig",
              hasQuestionToken: true,
            },
            {
              name: "queryOptions",
              type: `Omit<UseQueryOptions<AxiosResponse<${typeArgs}>, Error, AxiosResponse<${typeArgs}>>, 'queryKey' | 'queryFn'>`,
              hasQuestionToken: true,
            },
          ],
          returnType: `UseQueryResult<AxiosResponse<${typeArgs}>, Error>`,
          statements: `
  return useQuery<AxiosResponse<${typeArgs}>, Error, AxiosResponse<${typeArgs}>>({
    queryKey: ['${hookName}' ${extraHookParameters.length > 0 ? ", options?.params, options?.headers" : ""}],
    queryFn: async () => {
      const api = ${apiFactory.getName()}(new Configuration({ basePath: \`\${import.meta.env.VITE_BACKEND_URL}\` }));
      const res = await api.${endpointMethodName}(${extraHookParameters.map((p) => p.name).join(", ")}${extraHookParameters.length > 0 ? ", " : ""}{...options, withCredentials: true});
      return res;
    },
    ...queryOptions
  });
    `,
        });
      }
    }
  }
  project.save();
};

const generateTanstackQuery = (
  url: string,
  outDir: string,
  config: ProjectOptions,
): void => {
  const outPath = path.resolve(process.cwd(), outDir);
  createTanstackHooks(outDir, config);
};

function sanitizeTypeText(typeText: string): string {
  return typeText
    .replace(/import\([^)]+\)\./g, "") // Remove import paths like import("...").
    .replace(/\s+/g, "") // Remove any whitespace.
    .replace(/^Promise<(.+)>$/, "$1"); // Unwrap Promise if present.
}

function onlyAlphanumeric(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "");
}

export default generateTanstackQuery;
