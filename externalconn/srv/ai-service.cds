using {sap.capire.bookshop as my} from '../db/schema';

/**
 * Native AI assistant grounded on local Books + live S/4HANA data.
 * Exposed as OData (actions) AND MCP (tools) via @odata @mcp.
 */
@odata
@mcp
@mcp.instructions: 'Use askBooks for questions about local Books/Authors. Use askBusinessPartner for S/4 BusinessPartner/Supplier/Customer questions. Use askAll to search both worlds. All actions take a natural-language question and return a grounded answer.'
service AIAssistantService {

  /**
   * Ask a natural-language question about local Books/Authors.
   * @param question e.g. Which books are in stock? Who wrote Wuthering Heights?
   */
  action askBooks(question: String) returns String;

  /**
   * Ask a natural-language question about S/4 BusinessPartners/Suppliers/Customers/Addresses.
   * Live-reads S/4HANA Cloud (API_BUSINESS_PARTNER) and summarizes.
   * @param question e.g. Top 5 suppliers, customers in US, addresses in Berlin
   */
  action askBusinessPartner(question: String) returns String;

  /**
   * Ask across BOTH worlds (Books + S/4). Returns combined grounded answer.
   */
  action askAll(question: String) returns String;
}
