import express from "express";
import { fileURLToPath } from "url";
import path from "path";

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Serve static files in the same directory
const staticPath = path.resolve(__dirname);
app.use(express.static(staticPath));

// Serve index.html at route "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
