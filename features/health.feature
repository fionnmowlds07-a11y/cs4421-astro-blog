Feature: Health check endpoint
  As the platform running the container
  I want an endpoint that reports whether the service is up
  So that unhealthy instances can be detected and replaced

  Scenario: The service reports that it is healthy
    When I send a GET request to "/api/health"
    Then the response status should be 200
    And the response should be JSON
    And the response field "status" should equal "ok"
    And the response field "uptime" should be a number
    And the response field "timestamp" should be an ISO 8601 timestamp
