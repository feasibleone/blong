export default `@login
Feature: test login

  @admin
  Scenario: login with new admin user
    Given generate admin user
    Then login admin user
    Then get admin details
    Then fetch text type

  Scenario Outline: test variables
    * test int variable <age>
    * test float variable <weight>
    * test word variable <color>
    * test string variable <names>
    * test arbitrary variable <symbols>

    Examples:
      | age | weight | color | names    | symbols |
      | 10  | -5.4   | blue  | foo bar  | #@$     |
`;
