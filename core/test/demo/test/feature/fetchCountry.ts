export default `@fetchCountry
Feature: fetch country

  @fetchCountry @positive
  Scenario: Fetch country successfully
    Given generate admin user
    And login admin user
    When user fetches country with empty params successful result is returned
    Then logout admin user
`;
