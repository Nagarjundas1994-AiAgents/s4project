using {API_BUSINESS_PARTNER as external} from './external/API_BUSINESS_PARTNER';

service S4BusinessPartnerService @(path: '/s4bp') {

  @readonly
  entity BusinessPartners as projection on external.A_BusinessPartner {
    key BusinessPartner,
        Customer,
        Supplier,
        BusinessPartnerCategory,
        BusinessPartnerFullName,
        BusinessPartnerName,
        FirstName,
        LastName,
        OrganizationBPName1,
        OrganizationBPName2,
        CorrespondenceLanguage,
        CreatedByUser,
        CreationDate,
        Industry
  };

  @readonly
  entity BusinessPartnerAddresses as projection on external.A_BusinessPartnerAddress {
    key BusinessPartner,
    key AddressID,
        CityName,
        Country,
        PostalCode,
        StreetName,
        HouseNumber,
        Region,
        FullName
  };

  @readonly
  entity Suppliers as projection on external.A_Supplier {
    key Supplier,
        SupplierName,
        SupplierFullName,
        Customer,
        CreatedByUser,
        CreationDate
  };

  @readonly
  entity Customers as projection on external.A_Customer {
    key Customer,
        CustomerFullName,
        CustomerAccountGroup,
        CustomerClassification,
        CreatedByUser,
        CreationDate
  };
}
