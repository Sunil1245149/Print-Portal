import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Use express.json with large limit to handle base64 image uploads smoothly
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // File-backed persistence for Merchant configurations
  const CONFIG_FILE_PATH = path.join(process.cwd(), "merchant_config.json");

  const readMerchantConfig = (): any => {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const fileContent = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
        return JSON.parse(fileContent);
      }
    } catch (e) {
      console.error("Error reading merchant config:", e);
    }
    return {};
  };

  const saveMerchantConfig = (config: any) => {
    try {
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
    } catch (e) {
      console.error("Error writing merchant config:", e);
    }
  };

  // API Route: Get merchant configuration
  app.get("/api/merchant-config", (req, res) => {
    const config = readMerchantConfig();
    res.json(config);
  });

  // API Route: Save merchant configuration
  app.post("/api/merchant-config", (req, res) => {
    try {
      const { config } = req.body;
      if (!config) {
        return res.status(400).json({ error: "Missing config data" });
      }
      const existingConfig = readMerchantConfig();
      const updatedConfig = { ...existingConfig, ...config };
      saveMerchantConfig(updatedConfig);
      res.json({ success: true, config: updatedConfig });
    } catch (err: any) {
      console.error("Error saving merchant config:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Securely remove background via remove.bg API proxy
  app.post("/api/remove-bg", async (req, res) => {
    try {
      const { image, apiKey: clientApiKey } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image data" });
      }

      // Check for key provided by client, then server saved config, then environment, then fallback default
      const config = readMerchantConfig();
      const apiKey = clientApiKey || config.removeBgApiKey || process.env.REMOVE_BG_API_KEY || "oQJRvuroYuA3CWxTAez982p6";

      if (!apiKey) {
        return res.status(400).json({ error: "remove.bg API key is not configured." });
      }

      // Fetch remote URL if image is a link, otherwise get base64 data
      let base64Data = image;
      if (image.startsWith("http://") || image.startsWith("https://")) {
        try {
          const imgResponse = await fetch(image);
          if (!imgResponse.ok) {
            throw new Error(`Failed to fetch remote image (Status ${imgResponse.status})`);
          }
          const imgArrayBuffer = await imgResponse.arrayBuffer();
          base64Data = Buffer.from(imgArrayBuffer).toString("base64");
        } catch (fetchErr: any) {
          console.error("Error fetching remote image URL:", fetchErr);
          return res.status(400).json({ error: `Could not fetch remote image from storage: ${fetchErr.message}` });
        }
      } else if (image.includes(";base64,")) {
        base64Data = image.split(";base64,").pop();
      }

      // Construct request to remove.bg API using application/x-www-form-urlencoded
      const params = new URLSearchParams();
      params.append("image_file_b64", base64Data);
      params.append("size", "auto");

      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey.trim(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("remove.bg API error response:", errorText);
        let errorMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.errors && parsed.errors[0]) {
            errorMsg = parsed.errors[0].title;
          }
        } catch (e) {}
        return res.status(response.status).json({
          error: `remove.bg API Error: ${errorMsg || response.statusText}`
        });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const outputBase64 = buffer.toString("base64");

      res.json({
        image: `data:image/png;base64,${outputBase64}`
      });
    } catch (err: any) {
      console.error("Error in remove-bg proxy:", err);
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // File-backed persistence for document synchronization
  const DOCS_FILE_PATH = path.join(process.cwd(), "documents.json");

  const readDbDocuments = (): any[] => {
    try {
      if (fs.existsSync(DOCS_FILE_PATH)) {
        const fileContent = fs.readFileSync(DOCS_FILE_PATH, "utf-8");
        return JSON.parse(fileContent);
      }
    } catch (e) {
      console.error("Error reading documents from file-backed store:", e);
    }
    return [];
  };

  const saveDbDocuments = (docs: any[]) => {
    try {
      fs.writeFileSync(DOCS_FILE_PATH, JSON.stringify(docs, null, 2), "utf-8");
    } catch (e) {
      console.error("Error writing documents to file-backed store:", e);
    }
  };

  // API Route: Get all documents
  app.get("/api/documents", (req, res) => {
    const dbDocuments = readDbDocuments();
    res.json({ documents: dbDocuments });
  });

  // API Route: Bulk sync documents from React frontend to server
  app.post("/api/documents/sync", (req, res) => {
    try {
      const { documents } = req.body;
      if (!Array.isArray(documents)) {
        return res.status(400).json({ error: "Invalid documents array" });
      }
      
      // Preserve any local state server modifications, e.g., if a print agent has marked something as printed
      // but React hasn't polled it yet.
      // We merge them using ID. If status is different, we respect the print status if it has transitioned to 'printed'.
      const existing = readDbDocuments();
      const merged = documents.map((incomingDoc: any) => {
        const existDoc = existing.find(d => d.id === incomingDoc.id);
        if (existDoc && existDoc.status === 'printed' && incomingDoc.status === 'pending') {
          return { ...incomingDoc, status: 'printed' };
        }
        return incomingDoc;
      });

      saveDbDocuments(merged);
      res.json({ success: true, count: merged.length });
    } catch (err: any) {
      console.error("Error in documents sync:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Create/add a document
  app.post("/api/documents", (req, res) => {
    try {
      const { document } = req.body;
      if (!document || !document.id) {
        return res.status(400).json({ error: "Invalid document data" });
      }
      let dbDocuments = readDbDocuments();
      // Avoid adding duplicate IDs
      const exists = dbDocuments.some((d) => d.id === document.id);
      if (!exists) {
        dbDocuments.unshift(document);
      } else {
        // If it already exists, update it to keep client requests reliable
        dbDocuments = dbDocuments.map((d) => d.id === document.id ? { ...d, ...document } : d);
      }
      saveDbDocuments(dbDocuments);
      res.json({ success: true, documents: dbDocuments });
    } catch (err: any) {
      console.error("Error creating document:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Update a document
  app.put("/api/documents/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { document } = req.body;
      if (!document) {
        return res.status(400).json({ error: "Missing document data" });
      }
      let dbDocuments = readDbDocuments();
      dbDocuments = dbDocuments.map((d) => (d.id === id ? { ...d, ...document } : d));
      saveDbDocuments(dbDocuments);
      res.json({ success: true, documents: dbDocuments });
    } catch (err: any) {
      console.error("Error updating document:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Delete a document
  app.delete("/api/documents/:id", (req, res) => {
    try {
      const { id } = req.params;
      let dbDocuments = readDbDocuments();
      dbDocuments = dbDocuments.filter((d) => d.id !== id);
      saveDbDocuments(dbDocuments);
      res.json({ success: true, documents: dbDocuments });
    } catch (err: any) {
      console.error("Error deleting document:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Get print jobs (reusing the unified documents store)
  app.get("/api/print-jobs", (req, res) => {
    try {
      const statusFilter = req.query.status as string;
      const allDocs = readDbDocuments();
      let jobs = allDocs;
      if (statusFilter) {
        jobs = allDocs.filter(d => d.status === statusFilter);
      }
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Update print job status (PATCH method for print agents)
  app.patch("/api/print-jobs/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: "Missing status parameter" });
      }
      let allDocs = readDbDocuments();
      const exists = allDocs.some(d => d.id === id);
      if (!exists) {
        return res.status(404).json({ error: "Print job not found" });
      }
      allDocs = allDocs.map(d => d.id === id ? { ...d, status } : d);
      saveDbDocuments(allDocs);
      res.json({ success: true, document: allDocs.find(d => d.id === id) });
    } catch (err: any) {
      console.error("Error patching print-job:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Download dynamically configured Python Print Agent
  app.get("/api/download-agent", (req, res) => {
    try {
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const serverUrl = `${protocol}://${host}`;

      const agentCode = getPrintAgentTemplate().replace("{{SERVER_URL}}", serverUrl);

      res.setHeader('Content-Type', 'text/x-python');
      res.setHeader('Content-Disposition', 'attachment; filename=print-agent.py');
      res.send(agentCode);
    } catch (err: any) {
      console.error("Error generating print agent:", err);
      res.status(500).send(`Error generating print agent: ${err.message}`);
    }
  });

  function getPrintAgentTemplate(): string {
    return `import os
import sys
import time
import tempfile
import json
import urllib.request
import urllib.error
import base64
import subprocess

SERVER_URL = "{{SERVER_URL}}"
POLL_INTERVAL = 3  # seconds

print("==================================================")
print("🖨️  EASY-PRINT LOCAL PRINT AGENT (ऑटो-प्रिंट एजेंट)")
print("==================================================")
print("🔗 Connected to: " + SERVER_URL)
print("📡 Waiting for incoming print jobs... (प्रिंट जॉब्स की प्रतीक्षा कर रहा है...)")
print("Press Ctrl+C to exit.")
print("==================================================")

def get_pending_jobs():
    try:
        url = SERVER_URL + "/api/print-jobs?status=pending"
        req = urllib.request.Request(url, headers={'User-Agent': 'PrintAgent/1.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        return []

def mark_as_printed(job_id):
    try:
        url = SERVER_URL + "/api/print-jobs/" + str(job_id)
        data = json.dumps({"status": "printed"}).encode('utf-8')
        req = urllib.request.Request(
            url, 
            data=data, 
            headers={'Content-Type': 'application/json', 'User-Agent': 'PrintAgent/1.0'},
            method='PATCH'
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print("❌ Failed to mark job " + str(job_id) + " as printed: " + str(e))
        return None

def print_image(file_path, job_type):
    try:
        print("🖨️ Printing job (" + str(job_type) + ")...")
        if sys.platform.startswith('win'):
            # Windows silent direct print via PowerShell PrintDocument object
            ps_script = """
            Add-Type -AssemblyName System.Drawing
            $doc = New-Object System.Drawing.Printing.PrintDocument
            $doc.DocumentName = "Print-Agent-Job"
            $doc.add_PrintPage({
                param($sender, $e)
                $img = [System.Drawing.Image]::FromFile('""" + file_path.replace("'", "''") + """')
                
                # Calculate scaling to fit page nicely
                $printableWidth = $e.MarginBounds.Width
                $printableHeight = $e.MarginBounds.Height
                $imgWidth = $img.Width
                $imgHeight = $img.Height
                
                $ratioX = $printableWidth / $imgWidth
                $ratioY = $printableHeight / $imgHeight
                $ratio = [System.Math]::Min($ratioX, $ratioY)
                
                $newWidth = $imgWidth * $ratio
                $newHeight = $imgHeight * $ratio
                
                # Center the image on page
                $posX = $e.MarginBounds.Left + ($printableWidth - $newWidth) / 2
                $posY = $e.MarginBounds.Top + ($printableHeight - $newHeight) / 2
                
                $e.Graphics.DrawImage($img, $posX, $posY, $newWidth, $newHeight)
                $e.HasMorePages = $false
            })
            $doc.Print()
            """
            ps_temp = tempfile.mktemp(suffix=".ps1")
            with open(ps_temp, 'w', encoding='utf-8') as f:
                f.write(ps_script)
            
            subprocess.run([
                "powershell", 
                "-NoProfile", 
                "-ExecutionPolicy", "Bypass", 
                "-File", ps_temp
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            try:
                os.remove(ps_temp)
            except:
                pass
        else:
            # macOS / Linux: Use lp command (direct raw printing)
            subprocess.run(["lp", file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        print("✅ Print command sent successfully!")
        return True
    except Exception as e:
        print("❌ Printing failed: " + str(e))
        return False

while True:
    try:
        jobs = get_pending_jobs()
        for job in jobs:
            job_id = job.get('id')
            job_type = job.get('type', 'document')
            img_data_url = job.get('processedUrl', '')
            name = job.get('name', 'Job')
            
            if not img_data_url:
                continue
                
            print("\\n📥 Received print job: " + str(name) + " (" + str(job_id) + ")")
            
            temp_img_path = None
            try:
                suffix = ".jpg"
                if "image/png" in img_data_url:
                    suffix = ".png"
                
                temp_fd, temp_img_path = tempfile.mkstemp(suffix=suffix)
                os.close(temp_fd)
                
                if img_data_url.startswith("data:image"):
                    base64_data = img_data_url.split(",")[1]
                    img_bytes = base64.b64decode(base64_data)
                    with open(temp_img_path, 'wb') as f:
                        f.write(img_bytes)
                else:
                    req = urllib.request.Request(img_data_url, headers={'User-Agent': 'PrintAgent/1.0'})
                    with urllib.request.urlopen(req, timeout=10) as response:
                        with open(temp_img_path, 'wb') as f:
                            f.write(response.read())
                
                if print_image(temp_img_path, job_type):
                    mark_as_printed(job_id)
                    
            except Exception as e:
                print("❌ Error processing job: " + str(e))
            finally:
                if temp_img_path and os.path.exists(temp_img_path):
                    try:
                        os.remove(temp_img_path)
                    except:
                        pass
                        
        time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print("\\n👋 Print Agent stopped.")
        break
    except Exception as e:
        time.sleep(POLL_INTERVAL)
`
  }

  // Serve Vite or static assets depending on environment
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
