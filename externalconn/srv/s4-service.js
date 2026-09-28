import cds from '@sap/cds';

export class S4BusinessPartnerService extends cds.ApplicationService {
  async init() {
    // Connect to the external S/4HANA Cloud OData v2 service
    // Name must match cds.requires.<name> in package.json
    const bupa = await cds.connect.to('API_BUSINESS_PARTNER');

    const { BusinessPartners, BusinessPartnerAddresses, Suppliers, Customers } = this.entities;

    // Generic READ passthrough -> S/4HANA Cloud
    // This preserves $filter, $top, $skip, $orderby, $select, $expand from the incoming request
    this.on('READ', BusinessPartners, (req) => bupa.run(req.query));
    this.on('READ', BusinessPartnerAddresses, (req) => bupa.run(req.query));
    this.on('READ', Suppliers, (req) => bupa.run(req.query));
    this.on('READ', Customers, (req) => bupa.run(req.query));

    // Server-side aggregation: customers per country.
    // Why: the MCP query tool supports no GROUP BY/DISTINCT/JOIN, and fanning
    // out one filtered query per country trips the SAP sandbox rate limit
    // (HTTP 500 spike-arrest). Fetching ALL addresses into the LLM instead
    // blows the context (1.5M tokens observed). So aggregate here, page
    // sequentially with small pages, and return only compact counts.
    this.on('customerCountByCountry', async (req) => {
      const top = Math.min(Math.max(req.data?.top || 20, 1), 100);
      const { Customers, BusinessPartnerAddresses } = this.entities;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      // 1. All customer IDs (single paged loop, small pages)
      const customerIds = new Set();
      for (let skip = 0; skip < 20000; skip += 1000) {
        const rows = await bupa.run(
          SELECT.from(Customers).columns('Customer').limit(1000, skip)
        );
        if (!rows?.length) break;
        for (const r of rows) if (r.Customer != null) customerIds.add(String(r.Customer));
        if (rows.length < 1000) break;
        await sleep(150);
      }

      // 2. Page addresses sequentially, count per country for customers only
      const counts = new Map();
      let scanned = 0;
      let truncated = false;
      const PAGE = 500;
      const MAX_PAGES = 40; // 20k rows cap
      for (let page = 0; page < MAX_PAGES; page++) {
        const rows = await bupa.run(
          SELECT.from(BusinessPartnerAddresses).columns('BusinessPartner', 'Country').limit(PAGE, page * PAGE)
        );
        if (!rows?.length) break;
        scanned += rows.length;
        for (const r of rows) {
          if (r.BusinessPartner != null && customerIds.has(String(r.BusinessPartner))) {
            const c = (r.Country || '?').trim() || '?';
            counts.set(c, (counts.get(c) || 0) + 1);
          }
        }
        if (rows.length < PAGE) break;
        if (page === MAX_PAGES - 1) truncated = true;
        await sleep(150);
      }

      const countries = [...counts.entries()]
        .map(([country, customers]) => ({ country, customers }))
        .sort((a, b) => b.customers - a.customers)
        .slice(0, top);
      return JSON.stringify({
        countries,
        totalCustomers: customerIds.size,
        scanned,
        truncated,
        source: 'live S/4HANA Cloud API_BUSINESS_PARTNER via S4BusinessPartnerService',
      });
    });

    return super.init();
  }
}
