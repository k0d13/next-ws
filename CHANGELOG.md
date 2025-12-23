# next-ws

## 2.1.12

### Patch Changes

- 9bffbf4: Bump patch supported range to 16.1.1

## 2.1.11

### Patch Changes

- f8b8d70: Bump patch supported range to 16.1.0

## 2.1.10

### Patch Changes

- 02f578a: Bump patch supported range to 16.0.10

## 2.1.9

### Patch Changes

- cbffdcf: Bump patch supported range to 16.0.8

## 2.1.8

### Patch Changes

- 87152c2: Bump patch supported range to 16.0.5
- 1435fb2: Bump patch supported range to 16.0.6
- 9d049a0: Bump patch supported range to 16.0.7

## 2.1.7

### Patch Changes

- 36e429f: Bump patch supported range to 16.0.2
- 9c636dc: Bump patch supported range to 16.0.4
- 4c8be19: Bump patch supported range to 16.0.3

## 2.1.6

### Patch Changes

- 782a2d6: Bump patch supported range to 16.0.0
- ecddf0b: Bump patch supported range to 16.0.1

## 2.1.5

### Patch Changes

- 751dcc6: Bump patch supported range to 15.5.5
- 8e4e1bc: Bump patch supported range to 15.5.6

## 2.1.4

### Patch Changes

- 928b966: Bump patch supported range to 15.5.4

## 2.1.3

### Patch Changes

- f3ac6fc: Bump patch supported range to 15.5.3

## 2.1.2

### Patch Changes

- 5624dda: Add patch step to allow UPGRADE exports from route modules

## 2.1.1

### Patch Changes

- fde9dc7: Bump patch supported range to 15.5.1
- e318e37: Bump patch supported range to 15.5.2

## 2.1.0

### Minor Changes

- 2d2926b: Migrate patches to use ast parser instead of find/replace
- 30be438: Remove environment checks for getting persistent variables
- 1e29ec2: Drop esm build, ship cjs only
- 806c873: Introduce `UPGRADE` handler, mark `SOCKET` as deprecated
- b981361: Add request async storage for upgrade handlers
- 064cfd4: Catch and handle errors inside socket handlers

### Patch Changes

- 064cfd4: Fix not emitting connection event on websocket server
- 064cfd4: Prevent double-attaching upgrade listener
- 064cfd4: Support optional catch-all routes in matcher

## 2.0.14

### Patch Changes

- 9611355: Bump patch supported range to 15.4.7
- eff3087: Bump patch supported range to 15.5.0

## 2.0.13

### Patch Changes

- 86e459f: Bump patch supported range to 15.4.6

## 2.0.12

### Patch Changes

- 8b2a27e: Bump patch supported range to 15.4.2
- ff6aa44: Bump patch supported range to 15.4.3

## 2.0.11

### Patch Changes

- f4defd1: Bump patch supported range to 15.4.1

## 2.0.10

### Patch Changes

- 16a1e06: Bump patch supported range to 15.3.5
- b68bfdd: Escape dist path for safe require() usage

## 2.0.9

### Patch Changes

- 0c769e0: Bump patch supported range to 15.3.4

## 2.0.8

### Patch Changes

- 676a3f4: Bump patch supported range to 15.3.3
- 97fc08c: Bump patch supported range to 15.3.2

## 2.0.7

### Patch Changes

- ed876c4: Bump patch supported range to 15.3.1
- 01df147: Await default property of route module

## 2.0.6

### Patch Changes

- 8b30765: Add support for next config `basePath`
- 1051ec2: Bump patch supported range to 15.2.4

## 2.0.5

### Patch Changes

- 2af0987: Bump patch supported range to 15.2.3

## 2.0.4

### Patch Changes

- c37c965: Bump patch supported range to 15.2.2

## 2.0.3

### Patch Changes

- 0fe2960: Bump patch supported range to 15.2.1

## 2.0.2

### Patch Changes

- eee09c9: Bump patch supported range to 15.2.0
- b3a28f0: Mark client context as deprecated

## 2.0.1

### Patch Changes

- f0dbc9e: Fix not correctly getting socket handler on custom servers
- 442c788: Reduce package bundle size

## 2.0.0

### Major Changes

- 339915b: Merged the core and CLI packages into a single package. This change does not introduce any breaking changes to the public API of the core package.
