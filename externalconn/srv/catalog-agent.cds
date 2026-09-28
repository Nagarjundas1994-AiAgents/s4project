using { CatalogService } from './cat-service';

// Expose CatalogService (local Books data) as an A2A agent.
// Served at /a2a/catalog. Entities + submitOrder become MCP tools
// for the agent's ReAct loop automatically.
annotate CatalogService with @agent;

// Human-in-the-loop: agent must pause with `input-required`
// and wait for approval before placing an order.
annotate CatalogService.submitOrder with @agent.hitl;
