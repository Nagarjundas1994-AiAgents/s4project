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

    return super.init();
  }
}
