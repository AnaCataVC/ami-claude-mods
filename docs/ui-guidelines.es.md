# Guía de UI

[English](ui-guidelines.md) | [Español](ui-guidelines.es.md)

Un design system pequeño para que todos los mods se vean y hablen igual. Cubre solo lo que dibujan los mods: líneas de estado, toasts, la banda sobre el prompt y paneles laterales. Los mods nuevos lo siguen; los cambios a mods existentes los acercan a él.

## 1. Elige la superficie más liviana

| Necesidad | Superficie | Regla |
| :--- | :--- | :--- |
| Un valor vivo que vale la pena mirar de reojo | Línea de estado (`$.ui.status`) | Límpiala (`undefined`) cuando no haya nada que valga la pena mostrar. |
| Algo acaba de pasar, una vez | Toast (`$.ui.toast`) | Máximo uno por evento. Limita la frecuencia de lo que pueda repetirse. |
| Algo espera a la persona | Banda (`AbovePrompt`) | No dibujes nada (`next(e)`) cuando nada espera. Máximo 3 filas. |
| Detalle para recorrer | Panel (`$.ui.open`) | Lo abre un slash command, nunca se abre solo. |

## 2. Línea de estado

El host ya muestra el nombre del mod delante de la línea, así que el texto nunca lo repite.

- **Forma:** `{glifo} {valor} {pocas palabras}`. Ejemplo: `✓ 47% de 60% hoy`.
- **Largo:** 32 caracteres o menos. La fila corta el texto más largo.
- **Sin barras ni medidores.** Le quitan al número el ancho que necesita.
- **Separador:** ` · ` entre partes, y dos partes como máximo.

## 3. Toasts

- **Forma:** `{qué pasó} · {detalle}`, escrito como frase, sin prefijo con el nombre del mod y sin punto final.
  - Ejemplo: `Meta del día superada · llevas 84% de tu límite semanal (meta 60%)`.
- Si sigue una acción, nómbrala con el comando: `… · revisa /closing-checklist`.

## 4. Glifos: un significado cada uno

| Glifo | Significado | Token de color |
| :---: | :--- | :--- |
| `✓` | OK, hecho, al día | `success` |
| `◐` | En curso | `warning` |
| `⚠` | Requiere atención, cerca de un límite | `warning` |
| `✕` | Bloqueado, falló, pasado de un límite, no coincide | `error` |
| `○` | Listo para empezar | `suggestion` |
| `·` | Pendiente, sin empezar | `dimColor` |
| `●` | Cambió hace poco | `warning` |
| `?` | Alguien hizo una pregunta | `warning` |
| `⛔` | Puede bloquear (una capacidad, no un error) | `warning` |
| `⏱` | Tiempo bloqueado | `error` |
| `↻` `▶` `▾` `▸` `↳` `→` | Actualizar, lanzar, contraer, expandir, desbloquea, transición | — |

No agregues un glifo para un significado que ya está en la tabla, y no reutilices un glifo para otra cosa. Para agregar un significado nuevo, primero agrega una fila aquí. No uses emojis de color (🔴 🟢 …): cada sistema los dibuja distinto y chocan con el tema.

## 5. Color

- Usa **solo tokens del tema**: `success`, `warning`, `error`, `suggestion`, `subtle`, `inactive`, `permission`, `claude`, `text`. Los nombres crudos (`yellow`, `magenta`, `red`) ignoran el tema.
- El color indica severidad, no es decoración. El texto secundario usa `dimColor`.

## 6. Paneles y bandas

- **Contenedor:** `borderStyle="round"`, `borderDimColor`, `paddingX={1}`. El color del borde es la peor severidad que contiene (`success` cuando todo está bien).
- **Negrita:** escríbela `weight="bold"`. Úsala solo en títulos y en el único valor que importa.
- **Fila de encabezado:** primero el botón `↻ actualizar` (tecla `r`), después un resumen atenuado.
- **Estado vacío:** una frase atenuada que diga qué hacer: `Sin datos. Presiona r para actualizar.`
- **Botones:** un verbo en minúscula, opcionalmente precedido por un glifo de §4 (`▶ lanzar`), y una tecla de una letra cuando es frecuente. Los botones secundarios llevan `dimColor`.
- **Listas largas:** muestra algunos ítems y después `+N más`.

## 7. Idioma

- Todo texto que ve la persona vive en el `messages.ts` del mod, en `en` y en `es`. Eso incluye etiquetas y títulos de sección. Los nombres propios (`GitHub`, `Docker`, `kubectl`) quedan tal cual.
- `CLAUDE_MODS_LANG=es` selecciona español; cualquier otro valor es inglés. Léelo una vez en `session.start` con `langFrom`.
- El texto dirigido al modelo (motivos de bloqueo, prompts enviados) va en inglés, para que se lea igual para todos.
