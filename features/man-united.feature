# These scenarios describe a server started without FOOTBALL_DATA_API_KEY, as in CI,
# so they check the fallback behaviour rather than live football data.
Feature: Man United stats fallback
  As a visitor to the Man United section
  I want the page to still work when live stats can't be loaded
  So that an API outage or missing key never breaks the site

  Scenario: The page shows a friendly message instead of stats
    When I visit "/man-united"
    Then the response status should be 200
    And the page should use the "united" theme
    And the page should show the "stats-unavailable" element
    And the page should not show the "stats" element
    And the response should not be cacheable

  Scenario: The summary API reports that stats are unavailable
    When I send a GET request to "/api/man-united/summary"
    Then the response status should be 503
    And the response should be JSON
    And the response field "error" should contain "Man United stats"
    And the response should not be cacheable
