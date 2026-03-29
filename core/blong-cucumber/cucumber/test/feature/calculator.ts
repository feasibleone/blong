export default `Feature: Calculator

  Scenario: Add two numbers
    Then 5 plus 3 equals 8

  Scenario: Subtract two numbers
    Then 10 minus 3 equals 7

  Scenario Outline: Parameterized calculation
    Then <a> plus <b> equals <result>

    Examples:
      | a  | b  | result |
      | 1  | 2  | 3      |
      | 10 | 20 | 30     |
      | -5 | 5  | 0      |
`;
