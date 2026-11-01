# Aprendizajes Clave e Invariantes Arquitectónicos

[English](learnings.md) | [Español](learnings.es.md)

Registro de descubrimientos técnicos, restricciones de runtime y lecciones aprendidas durante el desarrollo, prueba y empaquetado de plugins para la CLI de Claude Code (Early Access 2.1+).

---

## 1. Restricciones de Validación Estática sobre la Interfaz del Motor (`$`)

El validador de plugins de Claude Code (`claude plugin validate <dir>`) ejecuta un análisis estático exhaustivo antes de cargar cualquier módulo de hooks. Una restricción esencial descubierta es la **exigencia de alcance de nivel superior para `$`**:

- **Problema:** Pasar la instancia `$` a una función inline o declarada dentro de `export const register: Register = on => { const helper = async ($) => { ... } }` produce el siguiente error de compilación:
  ```
  $ is passed to "helper", which is not a function declared at the top of this file
  ```
- **Solución:** Cualquier función auxiliar que reciba el parámetro `$` debe declararse en el alcance superior del archivo (`async function helper($: Engine) { ... }`).

---

## 2. Trampas en la Coalescencia Asíncrona de Variables de Entorno

Al crear plugins multiplataforma concebidos para Windows, macOS y Linux:

- **Problema:** Escribir `$.env.get('A') ?? $.env.get('B')` sin `await` genera un error sutil: como `$.env.get()` retorna una `Promise`, una expresión no esperada evalúa siempre a un objeto verdadero (*truthy*). El lado derecho (`HOME`) nunca llega a evaluarse, provocando que el plugin falle en silencio fuera de Windows.
- **Solución:** Resolución paralela garantizada con `await Promise.all`:
  ```typescript
  const [userProfile, home] = await Promise.all([
    $.env.get('USERPROFILE'),
    $.env.get('HOME'),
  ])
  const homeDir = userProfile ?? home
  ```

---

## 3. Precisión en la Intercepción de Roles de Subagentes (Cleanroom TDD)

La implementación del aislamiento Cleanroom Doble Ciego exige interceptar llamadas de subagentes según su rol (`agent.type`):

- **Problema:** Expresiones regulares genéricas como `/(implementer|builder)/i` o `/(tester|qa)/i` son excesivamente amplias. Bloquean erróneamente a agentes de dominio legítimos como `page-builder` o `qa-reviewer`.
- **Solución:** Acotar las coincidencias a tipos de agente de Cleanroom conocidos (`ami-cleanroom-builder`, `code-implementer-jr`, `ami-cleanroom-tester`, `test-writer-jr`) y limpiar cualquier prefijo de *namespace* antes de evaluar.

---

## 4. Registro Obligatorio de Estado en los Tipos del Manifiesto

Los átomos reactivos (`atom({ plugin, key })`) ofrecen persistencia de memoria entre turnos dentro de una sesión:

- **Problema:** Declarar un átomo cuya clave no esté tipada en `types/index.d.ts` extendiendo `interface PluginState` pasa las pruebas unitarias con mocks, pero falla en `claude plugin validate` con:
  ```
  <mod>.<key> is not declared: the manifest's types contract must name it in interface PluginState
  ```
- **Solución:** Declarar siempre todos los átomos de estado en el contrato `types/index.d.ts` del plugin antes de utilizarlos en los hooks.

---

## 5. Distribución y Empaquetado para el Catálogo de Plugins

- **Iconos:** El validador y el portal de desarrolladores exigen iconos PNG cuadrados (512x512 a 2048x2048 px, < 2 MB) ubicados en `.claude-plugin/icon.png` o referenciados mediante `icon` en `plugin.json`.
- **Manifiesto de hooks:** `hooks/hooks.json` debe especificar `{ "hooks": {}, "modules": ["./register.tsx"] }` para preservar la compatibilidad entre distintas versiones de Claude Code (evitando rechazos en entornos de CI que requieran el objeto `"hooks"`).
- **Parámetros CLI:** Además de `CLAUDE_CODE_PLUGIN_DIRS`, Claude Code admite nativamente cargar y probar mods usando el parámetro directo `claude --plugin-dir <dir>`.

---

## 6. Documentación Relacionada

- **Arquitectura y Especificaciones de Diseño:** Consulta [Arquitectura y Especificaciones](architecture.es.md) para detalles sobre el sandbox de ejecución y matrices de intercepción de eventos.
- **Automatizaciones y Pipelines de CI/CD:** Consulta la [Referencia de Automatizaciones](automations.es.md) para detalles sobre scripts de validación y flujos de GitHub Actions.

