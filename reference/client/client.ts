const SERVER_URL = process.env.SERVER_URL || "http://localhost:3099"

async function request(path: string, options?: RequestInit) {
  const url = `${SERVER_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

async function getAmtpMarkdown(path: string): Promise<string> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: { Accept: "text/amtp+markdown" },
  })
  return res.text()
}

async function main() {
  console.log(`\n  🔍 AMTP Reference Client\n`)
  console.log(`  Connecting to: ${SERVER_URL}\n`)

  // Step 1: Discover available skills
  console.log("  ── Step 1: Discovering skills ──\n")
  const root = await request("/")
  console.log(`  Title: ${root.title}`)
  console.log(`  Description: ${root.description}`)
  console.log(`  Available skills: ${root.skills.join(", ")}`)
  console.log()

  // Step 2: Fetch each skill's capability contract (JSON)
  console.log("  ── Step 2: Reading capability contracts ──\n")
  for (const skillName of root.skills) {
    const skill = await request(`/skills/${skillName}`)
    console.log(`  ${skill.name} (${skill.category})`)
    console.log(`    ${skill.description.slice(0, 80)}...`)
    for (const action of skill.actions) {
      console.log(`    → ${action.label}: ${action.description}`)
      const required = action.parameters.filter((p: any) => p.required).map((p: any) => p.name)
      if (required.length > 0) {
        console.log(`      Requires: ${required.join(", ")}`)
      }
    }
    console.log()
  }

  // Step 3: Get AMTP markdown for the echo skill
  console.log("  ── Step 3: Fetching AMTP markdown ──\n")
  const md = await getAmtpMarkdown("/skills/echo")
  console.log(md.slice(0, 400) + "\n...\n")

  // Step 4: Execute actions on each skill
  console.log("  ── Step 4: Executing actions ──\n")

  // Echo
  console.log("  ▶ Echo.say({ message: 'Hello AMTP!' })")
  const echoResult = await request("/api/actions/echo/say", {
    method: "POST",
    body: JSON.stringify({ message: "Hello AMTP!" }),
  })
  console.log(`    Result: ${JSON.stringify(echoResult.data)}`)
  console.log(`    Latency: ${echoResult.execution.latency}ms\n`)

  // Echo with uppercase
  console.log("  ▶ Echo.say({ message: 'hello', uppercase: true })")
  const echoUpper = await request("/api/actions/echo/say", {
    method: "POST",
    body: JSON.stringify({ message: "hello", uppercase: true }),
  })
  console.log(`    Result: ${JSON.stringify(echoUpper.data)}\n`)

  // Greet
  console.log("  ▶ Greeter.greet({ name: 'Agent', style: 'enthusiastic' })")
  const greetResult = await request("/api/actions/greet/greet", {
    method: "POST",
    body: JSON.stringify({ name: "Agent", style: "enthusiastic" }),
  })
  console.log(`    Result: ${JSON.stringify(greetResult.data)}\n`)

  // Greet in Spanish (formal)
  console.log("  ▶ Greeter.greet({ name: 'Mundo', style: 'formal', language: 'es' })")
  const greetEs = await request("/api/actions/greet/greet", {
    method: "POST",
    body: JSON.stringify({ name: "Mundo", style: "formal", language: "es" }),
  })
  console.log(`    Result: ${JSON.stringify(greetEs.data)}\n`)

  // Calculator
  console.log("  ▶ Calculator.calculate({ a: 42, b: 8, operation: 'multiply' })")
  const calcResult = await request("/api/actions/calculator/calculate", {
    method: "POST",
    body: JSON.stringify({ a: 42, b: 8, operation: "multiply" }),
  })
  console.log(`    Result: ${JSON.stringify(calcResult.data)}\n`)

  // Calculator division
  console.log("  ▶ Calculator.calculate({ a: 100, b: 3, operation: 'divide' })")
  const calcDiv = await request("/api/actions/calculator/calculate", {
    method: "POST",
    body: JSON.stringify({ a: 100, b: 3, operation: "divide" }),
  })
  console.log(`    Result: ${JSON.stringify(calcDiv.data)}\n`)

  // Step 5: Error handling demo
  console.log("  ── Step 5: Error handling ──\n")

  try {
    console.log("  ▶ Missing required parameter:")
    await request("/api/actions/echo/say", {
      method: "POST",
      body: JSON.stringify({}),
    })
  } catch (err: any) {
    console.log(`    Caught: ${err.message}\n`)
  }

  try {
    console.log("  ▶ Division by zero:")
    await request("/api/actions/calculator/calculate", {
      method: "POST",
      body: JSON.stringify({ a: 10, b: 0, operation: "divide" }),
    })
  } catch (err: any) {
    console.log(`    Caught: ${err.message}\n`)
  }

  console.log("  ── All done ──")
}

main().catch(console.error)
