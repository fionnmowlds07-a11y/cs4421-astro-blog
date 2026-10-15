Feature: Feedback submission
  As a reader of the blog
  I want to send feedback about the site
  So that the author can hear what readers think

  Scenario: A reader submits feedback with a rating
    When I send a POST request to "/api/feedback" with body:
      """
      { "message": "Great post about rowing!", "rating": 5 }
      """
    Then the response status should be 201
    And the response should be JSON
    And the response field "status" should equal "received"
    And the response field "id" should be a UUID

  Scenario: A reader submits feedback without a rating
    When I send a POST request to "/api/feedback" with body:
      """
      { "message": "Nice site" }
      """
    Then the response status should be 201
    And the response field "status" should equal "received"

  Scenario: Feedback that is not valid JSON is rejected
    When I send a POST request to "/api/feedback" with body:
      """
      this is not json
      """
    Then the response status should be 400
    And the response field "error" should equal "Request body must be valid JSON"

  Scenario: Feedback with an overly long message is rejected
    When I submit feedback with a message of 1001 characters
    Then the response status should be 400
    And the response field "error" should contain "at most 1000 characters"

  Scenario Outline: Invalid feedback is rejected with a helpful error
    When I send a POST request to "/api/feedback" with body:
      """
      <body>
      """
    Then the response status should be 400
    And the response field "error" should contain "<error>"

    Examples:
      | case                     | body                               | error                                  |
      | body is not an object    | "just a string"                    | must be a JSON object                  |
      | message is missing       | { "rating": 3 }                    | `message` is required                  |
      | message is only spaces   | { "message": "   " }               | `message` is required                  |
      | rating is above 5        | { "message": "Hi", "rating": 6 }   | `rating` must be an integer from 1 to 5 |
      | rating is below 1        | { "message": "Hi", "rating": 0 }   | `rating` must be an integer from 1 to 5 |
      | rating is not an integer | { "message": "Hi", "rating": 2.5 } | `rating` must be an integer from 1 to 5 |
