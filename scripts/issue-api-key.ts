import { randomBytes } from 'crypto'

const usage = `
用法：
  npx tsx scripts/issue-api-key.ts --tier developer --id partner_alpha_20260710

参数：
  --tier  developer | partner | admin
  --id    小写 key ID，3-64 位，只能使用字母、数字、_ 和 -
  --env   live | test（默认 live）

签发 admin key 必须额外提供 --allow-admin。
该命令只在终端输出一次明文 key，不写入仓库、文件或 Vercel。
`.trim()

function valueFor(name: string): string | undefined {
    const equals = process.argv.find(argument => argument.startsWith(`${name}=`))
    if (equals) return equals.slice(name.length + 1)
    const index = process.argv.indexOf(name)
    return index >= 0 ? process.argv[index + 1] : undefined
}

function fail(message: string): never {
    console.error(message)
    console.error(usage)
    process.exit(1)
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage)
    process.exit(0)
}

const tier = valueFor('--tier')
if (tier !== 'developer' && tier !== 'partner' && tier !== 'admin') {
    fail('--tier 必须是 developer、partner 或 admin。')
}

const keyId = valueFor('--id')
if (!keyId || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(keyId)) {
    fail('--id 必须是 3-64 位小写标识符，只能包含字母、数字、_ 和 -。')
}

const environment = valueFor('--env') || 'live'
if (environment !== 'live' && environment !== 'test') {
    fail('--env 必须是 live 或 test。')
}
if (tier === 'admin' && !process.argv.includes('--allow-admin')) {
    fail('签发 admin key 必须显式传入 --allow-admin。')
}

const apiKey = `kb_${environment}_${tier}_${randomBytes(32).toString('base64url')}`
const environmentVariable = tier === 'admin' ? 'CURRICULUM_ADMIN_API_KEYS' : 'CURRICULUM_API_KEYS'
const registryEntry = tier === 'admin'
    ? `${keyId}:${apiKey}`
    : `${keyId}:${apiKey}:${tier}`

console.log(JSON.stringify({
    key_id: keyId,
    tier,
    issued_at: new Date().toISOString(),
    api_key: apiKey,
    environment_variable: environmentVariable,
    registry_entry: registryEntry,
    next_step: '将 registry_entry 追加到 Vercel Production 环境变量的现有值；明文 api_key 只发送给集成方一次。'
}, null, 2))
