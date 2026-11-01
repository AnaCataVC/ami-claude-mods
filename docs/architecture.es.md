# Arquitectura y Especificaciones de Diseño

Referencia técnica integral de `ami-claude-mods`, detallando el modelo de integración, ciclo de vida de los hooks, persistencia reactiva de estado y paradigmas de prueba en Claude Code.

---

## 1. Sandbox de Ejecución y Modelo de Aislamiento

Los mods de Claude Code operan dentro de un entorno de módulos ECMAScript gestionado directamente por el motor.

### Restricciones e Invariantes
- **Sin APIs Directas de Node.js:** Los plugins no pueden importar `node:fs`, `node:child_process` o `node:path`. Toda interacción con el sistema se realiza mediante `$.fs` y `$.process`.
- **Módulos ES de Nivel Superior:** Cada archivo de hooks debe ser un módulo ES. Las importaciones dinámicas (`import()`) y `require()` están prohibidas.
- **Ciclo de Vida de la Referencia del Motor (`$`):** La referencia al motor entregada en los manejadores de eventos representa el contexto activo. Para cumplir con la validación estática, las funciones auxiliares que reciban `$` deben declararse en el alcance superior del módulo.

---

## 2. Matriz de Intercepción de Eventos

El siguiente diagrama ilustra el flujo de intercepción de herramientas en la suite:

```mermaid
sequenceDiagram
    autonumber
    actor User as Desarrollador / Agente
    participant Engine as Motor de Claude Code
    participant Guard as Hooks Pre-Tool (context-guard / cleanroom-guard / undelegated-reads)
    participant Tool as Ejecutor de Herramienta (Read, Bash, etc.)
    participant UI as Superficies UI (AbovePrompt / Pane)

    User->>Engine: Emite comando o prompt
    Engine->>Guard: Evento tool.call
    alt Infracción de Regla Detectada
        Guard-->>Engine: return { deny: razón }
        Engine-->>User: Mensaje de denegación en pantalla
    else Autorizado
        Guard-->>Tool: next(e)
        Tool-->>Engine: Resultado de ejecución
        Engine->>UI: ui.render (Barra de estado / AbovePrompt)
    end
```

---

## 3. Persistencia Reactiva de Estado

El estado persistente entre turnos se declara mediante átomos:

```typescript
import { atom, read, update } from 'claude-code'

const countAtom = atom({ plugin: 'undelegated-reads', key: 'count' } as const, 0)
```

Cada clave atómica debe tiparse extendiendo la interfaz `PluginState` en `types/index.d.ts`:

```typescript
declare module 'claude-code' {
  interface PluginState {
    'undelegated-reads': { count: number }
  }
}
```

---

## 4. Protocolo Cleanroom Doble Ciego

En el desarrollo guiado por pruebas (TDD), el aislamiento de información entre el implementador y el autor de pruebas es fundamental para evitar el sesgo de confirmación.

`cleanroom-guard` conecta los subagentes de Claude Code con la skill `ami-orchestrate-cleanroom` de Amiga IA:

1. **Límite del Implementador:**
   - Rol: `ami-cleanroom-builder` o `code-implementer-jr`.
   - Bloqueado: Cualquier lectura, búsqueda o edición sobre rutas de pruebas (`tests/`, `__tests__/`, `*.test.*`, `*_test.*`, `spec/`).
2. **Límite del Autor de Pruebas:**
   - Rol: `ami-cleanroom-tester` o `test-writer-jr`.
   - Bloqueado: Lectura de diffs del working tree sin commitear (`git diff`) o código de producción (`.py`, `.ts`, `.go`, etc.).
   - Permitido: Redacción de pruebas y lectura de versiones base commiteadas mediante `git show HEAD:<path>`.
