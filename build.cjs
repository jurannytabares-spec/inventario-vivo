/**
 * Genera la versión de un solo archivo a partir del código organizado.
 * Ejecuta: node build.cjs
 * No requiere instalar paquetes: utiliza únicamente módulos de Node.js.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceDirectory = __dirname;
const outputFile = path.join(sourceDirectory, '..', 'Inventario_Vivo.html');

// Trabaja primero sobre una copia en memoria del HTML.
let html = fs.readFileSync(path.join(sourceDirectory, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(sourceDirectory, 'styles.css'), 'utf8');

html = html.replace(
  /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?>/,
  () => `<style>\n${css}\n</style>`,
);

// El orden importa: los archivos siguientes utilizan los anteriores.
const scriptFiles = [
  'data.js',
  'core.js',
  'app.js',
  'analytics.js',
  'interactions.js',
  'extensions.js',
];

for (const filename of scriptFiles) {
  const javascript = fs.readFileSync(path.join(sourceDirectory, filename), 'utf8');

  // Detecta errores de sintaxis antes de entregar el HTML.
  new vm.Script(javascript, { filename });

  // Evita que texto incluido en los datos cierre accidentalmente un script.
  const safeJavascript = javascript.replace(/<\/script/gi, '<\\/script');

  html = html.replace(
    `<script src="${filename}"></script>`,
    () => `<script>\n${safeJavascript}\n</script>`,
  );
}

if (/<script src=|<link rel="stylesheet"/.test(html)) {
  throw new Error('Quedó una dependencia externa sin incorporar.');
}

fs.writeFileSync(outputFile, html);
console.log(`Versión autónoma generada: ${outputFile}`);
