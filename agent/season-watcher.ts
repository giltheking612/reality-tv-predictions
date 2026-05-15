import Anthropic from '@anthropic-ai/sdk'
import { tools as allTools, executeWebSearch } from './tools.js'
import { createSeason, logAction } from './db.js'
import { runEpisodeWatcher } from './episode-watcher.js'

const client = new Anthropic()

const seasonWatcherTools: Anthropic.Tool[] = [
  allTools.find(t => t.name === 'web_search')!,
  {
    name: 'create_season',
    description: 'Create a new season for a show once confirmed it has started airing in Israel.',
    input_schema: {
      type: 'object' as const,
      properties: {
        show_id: { type: 'string' },
        number: { type: 'number', description: 'Season number (next logical one)' },
        name_he: { type: 'string', description: 'Season name in Hebrew, e.g. "עונה 3"' },
        start_date: { type: 'string', description: 'Actual air start date in YYYY-MM-DD format' },
      },
      required: ['show_id', 'number', 'name_he'],
    },
  },
]

export async function runSeasonWatcher(show: {
  id: string
  name_he: string
  name_en: string
  slug: string
  type: string
}) {
  console.log(`[SeasonWatcher] Checking for new season: ${show.name_he}`)

  let newSeason: any = null

  const systemPrompt = `You are an admin agent for an Israeli reality TV prediction website.
Your job is to check if a new season of a show has recently started airing in Israel.

Show: ${show.name_he} (${show.name_en})
Show ID: ${show.id}

Steps:
1. Search the web in Hebrew to check if a new season of this show is currently airing or started within the last 2 weeks.
2. If a new season has CONFIRMED started airing (not just announced or scheduled), create it using create_season.
   - number: next logical season number (search how many seasons existed before).
   - name_he: 'עונה N'
   - start_date: the actual first episode air date in YYYY-MM-DD.
3. If no new season has started airing yet, do nothing.

Only create a season for something that is currently on air. Ignore upcoming/announced seasons.`

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Check if a new season of ${show.name_he} has started airing in Israel.`,
    },
  ]

  let response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    tools: seasonWatcherTools,
    messages,
  })

  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter(b => b.type === 'tool_use')
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUses) {
      if (toolUse.type !== 'tool_use') continue
      let result: string

      try {
        if (toolUse.name === 'web_search') {
          result = await executeWebSearch((toolUse.input as { query: string }).query)
        } else if (toolUse.name === 'create_season') {
          const input = toolUse.input as {
            show_id: string; number: number; name_he: string; start_date?: string
          }
          newSeason = await createSeason({ ...input, status: 'active' })
          await logAction('create_season', { season_id: newSeason.id, ...input })
          result = JSON.stringify(newSeason)
        } else {
          result = `Unknown tool: ${toolUse.name}`
        }
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
    }

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })

    response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: seasonWatcherTools,
      messages,
    })
  }

  const finalText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('\n')

  console.log(`[SeasonWatcher] ${show.name_he}: ${finalText}`)

  if (newSeason) {
    console.log(`[SeasonWatcher] New season created — running episode watcher immediately`)
    await runEpisodeWatcher({ ...newSeason, show })
  }

  return newSeason
}
