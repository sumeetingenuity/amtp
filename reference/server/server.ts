import express from "express"

const app = express()
const PORT = 3099

app.use(express.json())
app.use((_req, res, next) => {
  res.setHeader("X-AMTP-Version", "1.0")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
  next()
})

type SkillAction = {
  id: string
  label: string
  description: string
  method: "GET" | "POST"
  endpoint: string
  parameters: Array<{
    name: string
    type: string
    required: boolean
    description: string
    default?: unknown
    enum?: string[]
  }>
  riskLevel: "low" | "medium" | "high"
}

type SkillManifest = {
  name: string
  description: string
  version: string
  protocol: string
  category: string
  tags: string[]
  actions: SkillAction[]
}

const SKILLS: Record<string, SkillManifest> = {
  echo: {
    name: "Echo",
    description: "Simple echo service — sends back whatever message you send it. Useful for testing connectivity and latency.",
    version: "1.0.0",
    protocol: "amtp-2025-01",
    category: "utility",
    tags: ["echo", "test", "utility"],
    actions: [
      {
        id: "say",
        label: "Say",
        description: "Echo a message back",
        method: "POST",
        endpoint: "/api/actions/echo/say",
        parameters: [
          { name: "message", type: "string", required: true, description: "The message to echo" },
          { name: "uppercase", type: "boolean", required: false, description: "Convert to uppercase", default: false },
        ],
        riskLevel: "low",
      },
    ],
  },
  greet: {
    name: "Greeter",
    description: "Personalized greeting service. Generates friendly greetings in multiple languages and styles.",
    version: "1.0.0",
    protocol: "amtp-2025-01",
    category: "utility",
    tags: ["greeting", "utility"],
    actions: [
      {
        id: "greet",
        label: "Greet",
        description: "Generate a personalized greeting",
        method: "POST",
        endpoint: "/api/actions/greet/greet",
        parameters: [
          { name: "name", type: "string", required: true, description: "Your name" },
          {
            name: "style",
            type: "string",
            required: false,
            description: "Greeting style",
            default: "casual",
            enum: ["casual", "formal", "enthusiastic"],
          },
          {
            name: "language",
            type: "string",
            required: false,
            description: "Language code",
            default: "en",
            enum: ["en", "es", "fr", "de"],
          },
        ],
        riskLevel: "low",
      },
    ],
  },
  calculator: {
    name: "Calculator",
    description: "Basic arithmetic calculator. Supports addition, subtraction, multiplication, division, and exponentiation.",
    version: "1.0.0",
    protocol: "amtp-2025-01",
    category: "utility",
    tags: ["calculator", "math", "utility"],
    actions: [
      {
        id: "calculate",
        label: "Calculate",
        description: "Perform a basic arithmetic operation",
        method: "POST",
        endpoint: "/api/actions/calculator/calculate",
        parameters: [
          { name: "a", type: "number", required: true, description: "First operand" },
          { name: "b", type: "number", required: true, description: "Second operand" },
          {
            name: "operation",
            type: "string",
            required: true,
            description: "Operation to perform",
            enum: ["add", "subtract", "multiply", "divide", "power"],
          },
        ],
        riskLevel: "low",
      },
    ],
  },
}

function generateAmtpMarkdown(skill: SkillManifest): string {
  const lines: string[] = []

  lines.push(`# ${skill.name}`)
  lines.push("")
  lines.push(skill.description)
  lines.push("")
  lines.push(`**Version**: ${skill.version}`)
  lines.push(`**Protocol**: ${skill.protocol}`)
  lines.push(`**Category**: ${skill.category}`)
  lines.push(`**Tags**: ${skill.tags.join(", ")}`)
  lines.push("")

  lines.push("```amtp-meta")
  lines.push(JSON.stringify({ pageId: skill.name.toLowerCase(), pageType: "skill", version: skill.version }, null, 2))
  lines.push("```")
  lines.push("")

  lines.push("## Actions")
  lines.push("")
  for (const action of skill.actions) {
    lines.push(`[${action.label.toUpperCase()}] — ${action.description}`)
  }
  lines.push("")

  lines.push("```amtp-action")
  lines.push(JSON.stringify(skill.actions, null, 2))
  lines.push("```")
  lines.push("")

  return lines.join("\n")
}

function negotiateResponse(req: express.Request, res: express.Response, data: unknown) {
  const accept = req.headers.accept || ""

  if (accept.includes("text/amtp+markdown") && typeof data === "object" && data !== null) {
    const manifest = data as SkillManifest
    res.setHeader("Content-Type", "text/amtp+markdown; charset=utf-8")
    return res.send(generateAmtpMarkdown(manifest))
  }

  if (accept.includes("text/html") && typeof data === "object" && data !== null) {
    const manifest = data as SkillManifest
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    return res.send(`<!DOCTYPE html>
<html><head><title>${manifest.name}</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6}
pre{background:#f5f5f5;padding:1rem;border-radius:8px;overflow-x:auto}
code{background:#f0f0f0;padding:0.2rem 0.4rem;border-radius:4px}
h1{border-bottom:2px solid #eee;padding-bottom:0.5rem}</style></head><body>
<h1>${manifest.name}</h1><p>${manifest.description}</p>
<h2>Actions</h2><ul>${manifest.actions.map(a => `<li><strong>${a.label}</strong>: ${a.description}</li>`).join("")}</ul>
<pre>${JSON.stringify(manifest, null, 2)}</pre></body></html>`)
  }

  res.json(data)
}

app.get("/", (req, res) => {
  const rootDoc = {
    type: "document",
    title: "AMTP Reference Server",
    description: "A reference implementation of the AMTP protocol with example skills.",
    version: "1.0",
    protocol: "amtp-2025-01",
    skills: Object.keys(SKILLS),
    links: [
      { text: "Echo Skill", url: "/skills/echo", type: "internal" },
      { text: "Greet Skill", url: "/skills/greet", type: "internal" },
      { text: "Calculator Skill", url: "/skills/calculator", type: "internal" },
      { text: "Health Check", url: "/health", type: "internal" },
    ],
  }

  const accept = req.headers.accept || ""
  if (accept.includes("text/amtp+markdown")) {
    res.setHeader("Content-Type", "text/amtp+markdown; charset=utf-8")
    return res.send(`# AMTP Reference Server\n\n${rootDoc.description}\n\n## Skills\n\n${rootDoc.skills.map((s: string) => `- [${s}](/skills/${s})`).join("\n")}\n\n## Links\n\n${rootDoc.links.map((l: any) => `- [${l.text}](${l.url})`).join("\n")}`)
  }

  res.json(rootDoc)
})

app.get("/skills/:skillName", (req, res) => {
  const skill = SKILLS[req.params.skillName]
  if (!skill) {
    return res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Skill not found" } })
  }
  negotiateResponse(req, res, skill)
})

app.post("/api/actions/:skill/:action", (req, res) => {
  const { skill: skillName, action: actionId } = req.params
  const skill = SKILLS[skillName]

  if (!skill) {
    return res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: `Skill '${skillName}' not found` } })
  }

  const action = skill.actions.find((a) => a.id === actionId)
  if (!action) {
    return res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: `Action '${actionId}' not found on '${skillName}'` } })
  }

  const params = req.body || {}
  const missing = action.parameters.filter((p) => p.required && params[p.name] === undefined)
  if (missing.length > 0) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: `Missing required parameters: ${missing.map((p) => p.name).join(", ")}`,
        details: { missing: missing.map((p) => p.name) },
      },
    })
  }

  let result: unknown

  switch (skillName) {
    case "echo": {
      const msg = String(params.message || "")
      result = { message: params.uppercase ? msg.toUpperCase() : msg, length: msg.length }
      break
    }
    case "greet": {
      const greetings: Record<string, Record<string, string>> = {
        en: { casual: "Hey", formal: "Hello", enthusiastic: "Hey there" },
        es: { casual: "Hola", formal: "Saludos", enthusiastic: "¡Hola" },
        fr: { casual: "Salut", formal: "Bonjour", enthusiastic: "Salut" },
        de: { casual: "Hallo", formal: "Guten Tag", enthusiastic: "Hallo" },
      }
      const lang = (params.language as string) || "en"
      const style = (params.style as string) || "casual"
      const greeting = greetings[lang]?.[style] || greetings.en.casual
      result = { greeting: `${greeting}, ${params.name}!`, language: lang, style }
      break
    }
    case "calculator": {
      const a = Number(params.a)
      const b = Number(params.b)
      const op = params.operation as string

      if (isNaN(a) || isNaN(b)) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid numeric operands" } })
      }

      let value: number
      switch (op) {
        case "add": value = a + b; break
        case "subtract": value = a - b; break
        case "multiply": value = a * b; break
        case "divide":
          if (b === 0) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Division by zero" } })
          value = a / b
          break
        case "power": value = Math.pow(a, b); break
        default:
          return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Unknown operation: ${op}` } })
      }
      result = { operation: op, a, b, result: value }
      break
    }
    default:
      return res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Skill not found" } })
  }

  const execution = {
    id: `exec_${Date.now()}`,
    action: actionId,
    skill: skillName,
    latency: Math.floor(Math.random() * 100 + 10),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  }

  res.json({ status: "success", data: result, execution })
})

app.get("/health", (_req, res) => {
  res.json({ status: "healthy", version: "1.0.0", skills: Object.keys(SKILLS).length })
})

app.listen(PORT, () => {
  console.log(`AMTP Reference Server running on http://localhost:${PORT}`)
  console.log(`Skills: ${Object.keys(SKILLS).join(", ")}`)
  console.log("\nTry:")
  console.log(`  curl -H "Accept: text/amtp+markdown" http://localhost:${PORT}/skills/echo`)
  console.log(`  curl -X POST http://localhost:${PORT}/api/actions/echo/say -H "Content-Type: application/json" -d '{"message":"hello"}'`)
})
