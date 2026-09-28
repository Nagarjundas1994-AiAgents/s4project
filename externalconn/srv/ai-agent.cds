using { AIAssistantService } from './ai-service';

// Expose AIAssistantService (grounded askBooks / askBusinessPartner / askAll
// actions over Books + live S/4 data) as an A2A agent.
// Served at /a2a/aiassistant.
//
// NOTE (SAP API Policy): the raw S4BusinessPartnerService passthrough is
// intentionally NOT annotated with @agent — agents must not act as
// gateways/proxies for SAP Application APIs. S/4 data reaches the agent
// only through the custom grounded actions above.
annotate AIAssistantService with @agent;
