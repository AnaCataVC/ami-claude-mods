# Aprendizajes de Arquitectura y Patrones de Ingeniería

[English](README.md) | [Español](README.es.md)

Base de conocimiento curada sobre invariantes arquitectónicos, particularidades de runtime, descubrimientos de plataforma y patrones de diseño establecidos durante el desarrollo, prueba y securización de `ami-claude-mods`.

---

## Catálogo de Patrones de Ingeniería

| Guía | Dominio Operativo | Foco Principal |
| :--- | :--- | :--- |
| **[`engine-reference-top-level-scope.md`](engine-reference-top-level-scope.md)** | Motor de Runtime / Análisis Estático | Exigencia de alcance superior en el módulo para referencias de motor (`$`), previniendo fugas en closures y cumpliendo con el validador estático. |
| **[`async-environment-resolution-fallbacks.md`](async-environment-resolution-fallbacks.md)** | Multiplataforma / Asincronía | Prevención de errores sutiles por evaluación de Promises (*truthy*) en variables de entorno (`$.env.get`) mediante resolución paralela con `Promise.all`. |
| **[`cleanroom-subagent-role-matching.md`](cleanroom-subagent-role-matching.md)** | Subagentes / Aislamiento TDD | Coincidencia exacta de roles y saneamiento de *namespaces* para aislamiento Cleanroom Doble Ciego sin bloquear subagentes de dominio general. |
| **[`declarative-state-registration-types.md`](declarative-state-registration-types.md)** | Gestión de Estado / TypeScript | Registro obligatorio de claves atómicas en contratos de manifiesto (`interface PluginState`) para prevenir colisiones de estado. |
| **[`packaging-and-marketplace-manifest-invariants.md`](packaging-and-marketplace-manifest-invariants.md)** | Empaquetado / Distribución | Restricciones de iconos PNG cuadrados, compatibilidad retrospectiva con esquema dual en `hooks.json` y empaquetado limpio de versiones. |
| **[`dual-host-interoperability-desktop-and-cli.md`](dual-host-interoperability-desktop-and-cli.md)** | Entornos Anfitriones / Renderizado UI | Paridad total entre Claude Desktop y Claude Code CLI, descubrimiento mediante `~/.claude/settings.json` y adaptación de superficies con `$.ui.resolve`. |

---

## Documentación Relacionada

- **Especificaciones de Arquitectura:** Consulta [docs/architecture.es.md](../architecture.es.md) para detalles sobre el sandbox de ejecución y matrices de intercepción de eventos.
- **Automatizaciones y Flujos de Trabajo:** Consulta [docs/automations.es.md](../automations.es.md) para pipelines de CI/CD, hooks de calidad pre-push y empaquetado de releases.
