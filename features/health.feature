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
    And the response should not have the field "checks"

  # CI has no Supabase settings, so the deep check reports the database as not configured rather than down.
  Scenario: The deep health check reports on the database without failing when it isn't set up
    When I send a GET request to "/api/health?deep=1"
    Then the response status should be 200
    And the response should be JSON
    And the response field "status" should equal "ok"
    And the response field "checks.database.status" should equal "not_configured"
    And the response should not be cacheable
