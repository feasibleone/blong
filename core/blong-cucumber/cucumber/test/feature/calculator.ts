export default `Feature: Calculator

  Scenario: Add two numbers
    When I add 5 and 3
    Then the result should be 8

  Scenario: Subtract two numbers
    When I subtract 3 from 10
    Then the result should be 7

  Scenario Outline: Parameterized addition
    When I add <a> and <b>
    Then the result should be <result>

    Examples:
      | a  | b  | result |
      | 1  | 2  | 3      |
      | 10 | 20 | 30     |
      | -5 | 5  | 0      |
`;
