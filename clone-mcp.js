import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { execa } from "execa";
import path from "path";
import fs from "fs-extra";
import archiver from "archiver";

// 1️⃣ Creamos el servidor MCP
const server = new McpServer({
  name: "site-cloner",
  version: "0.1.0"
});

// 2️⃣ Registramos la herramienta cloneSite
server.registerTool(
  "cloneSite",
  {
    title: "Clonar sitio web completo",
    description: "Descarga HTML, CSS, JS y recursos de un sitio usando Puppeteer",
    inputSchema: z.object({
      url: z.string().url(),
      outputDir: z.string().default("cloned_site")
    })
  },
  async ({ url, outputDir }) => {
    try {
      console.log(`🔄 Iniciando clonación de: ${url}`);
      
      // Limpiamos o creamos la carpeta destino
      await fs.remove(outputDir);
      await fs.mkdirp(outputDir);

      // Ejecutamos tu script Puppeteer (clone.js)
      console.log(`📥 Descargando sitio con Puppeteer...`);
      await execa("node", ["clone.js", url, outputDir], { 
        stdio: "inherit",
        timeout: 300000 // 5 minutos de timeout
      });

      // Verificar que se hayan descargado archivos
      const files = await fs.readdir(outputDir);
      if (files.length === 0) {
        throw new Error("No se descargaron archivos del sitio");
      }

      console.log(`📦 Comprimiendo ${files.length} archivos...`);
      
      // Comprimir en ZIP usando archiver
      const zipPath = path.join(outputDir, "site.zip");
      
      // Crear un stream de escritura para el archivo ZIP
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Nivel máximo de compresión
      });
      
      // Esperamos a que el archivo se cierre
      const streamFinished = new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
      });
      
      // Conectar el archiver al stream de salida
      archive.pipe(output);
      
      // Agregar todos los archivos de la carpeta outputDir al ZIP
      archive.directory(outputDir, false);
      
      // Finalizar el archivo
      await archive.finalize();
      await streamFinished;

      const stats = await fs.stat(zipPath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log(`✅ Clonación completada. ZIP: ${sizeInMB} MB`);

      return {
        content: [
          { 
            type: "text", 
            text: `✅ Sitio clonado exitosamente\n📁 Carpeta: ${outputDir}\n📦 ZIP: ${sizeInMB} MB\n📄 Archivos: ${files.length}` 
          },
          {
            type: "resource_link",
            uri: `file://${zipPath}`,
            name: "site.zip",
            mimeType: "application/zip",
            description: "ZIP con todo el sitio clonado"
          }
        ]
      };
    } catch (error) {
      console.error("❌ Error al clonar sitio:", error);
      return {
        content: [
          { 
            type: "text", 
            text: `❌ Error al clonar el sitio: ${error.message}` 
          }
        ],
        isError: true
      };
    }
  }
);

// 3️⃣ Levantamos el MCP en el puerto dinámico de Railway
(async () => {
  const port = process.env.PORT || 3030;
  const transport = new StreamableHTTPServerTransport({
    port: parseInt(port),
    path: "/mcp"
  });
  await server.connect(transport);
  console.log(`🚀 Site cloner MCP corriendo en puerto ${port} - path: /mcp`);
})();
