# OpenAPI TS Generator

**OpenAPI TS Generator** is a TypeScript library that generates **type-safe Axios REST clients wrapped by TanStack Query react hooks** from an OpenAPI JSON specification URL.

The library:

- Fetches the OpenAPI spec directly from a Spring Boot microservice endpoint using **Swagger-UI** (the OpenAPI dependency).
- Always generates fully typed **Axios REST clients wrapped by TanStack Query react hooks**.
- Preserves request and response types defined in the OpenAPI spec.
- Made for Spring Boot microservices using Swagger-UI, but can be used with any endpoint that serves an OpenAPI YAML file.
- Designed for **manual generation**: developers explicitly run the generator to update types, Axios clients, and optional hooks.

## Usage

Set up by installing dev depenencies -

```bash
$ npm install --save-dev @openapitools/openapi-generator-cli ts-morph
```

### Manual generation

```bash
# Fetch spec and generate files
$ openapi-ts-generator --config openapi-config.json
```
