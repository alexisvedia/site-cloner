import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { execa } from "execa";
import path from "path";
import fs from "fs-extra";

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
    // Limpiamos o creamos la carpeta destino
    await fs.remove(outputDir);
    await fs.mkdirp(outputDir);

    // Ejecutamos tu script Puppeteer (clone.js)
    await execa("node", ["clone.js", url, outputDir], { stdio: "inherit" });

    // Opcional: comprimir en ZIP
// Opcional: comprimir en ZIP con zip de Linux
const zipPath = path.join(outputDir, "site.zip");
// Zipea todo el contenido de la carpeta outputDir
await execa("zip", ["-r", zipPath, "."], { cwd: outputDir });


    return {
      content: [
        { type: "text", text: `Sitio clonado en carpeta \`${outputDir}\`.` },
        {
          type: "resource_link",
          uri: `file://${zipPath}`,
          name: "site.zip",
          mimeType: "application/zip",
          description: "ZIP con todo el sitio clonado"
        }
      ]
    };
  }
);

// 3️⃣ Levantamos el MCP en el puerto 3030
(async () => {
  const transport = new StreamableHTTPServerTransport({
    port: 3030,
    path: "/mcp"
  });
  await server.connect(transport);
  console.log("🚀 Site cloner MCP corriendo en http://localhost:3030/mcp");
})();
