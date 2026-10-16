# Like man-united.feature, these scenarios describe a server started without FOOTBALL_DATA_API_KEY, as in CI,
# so they check that every stats page and the league API fail gracefully, and that the section menu works.
Feature: Premier League stats explorer
  As a visitor to the Man United section
  I want to move between the table, stats, comparison, squad and scorers pages
  So that I can explore the whole league, even when live stats can't be loaded

  Scenario Outline: Each stats page loads with its own title and a friendly fallback
    When I visit "<path>"
    Then the response status should be 200
    And the page title should be "<title>"
    And the page should use the "united" theme
    And the page should show the "stats-unavailable" element
    And the response should not be cacheable

    Examples:
      | path                 | title                                             |
      | /man-united/table    | Premier League table \| Fionn Mowlds's blog       |
      | /man-united/stats    | Premier League stats \| Fionn Mowlds's blog       |
      | /man-united/compare  | Compare teams \| Fionn Mowlds's blog              |
      | /man-united/squad    | Man United squad \| Fionn Mowlds's blog           |
      | /man-united/scorers  | Premier League top scorers \| Fionn Mowlds's blog |

  Scenario Outline: Unexpected options in the address don't break a page
    When I visit "<path>"
    Then the response status should be 200
    And the page should show the "stats-unavailable" element

    Examples:
      | path                                         |
      | /man-united/table?view=bogus&sort=nope&dir=x |
      | /man-united/stats?sort=bogus&order=sideways  |
      | /man-united/compare?team=zzz                 |
      | /man-united/scorers?team=nobody              |

  Scenario: The section menu links to every page and marks the current one
    When I visit "/man-united/stats"
    Then the page should link to "/man-united"
    And the page should link to "/man-united/table"
    And the page should link to "/man-united/compare"
    And the page should link to "/man-united/squad"
    And the page should link to "/man-united/scorers"
    And the section menu should mark "/man-united/stats" as the current page

  Scenario: The league stats API reports that stats are unavailable
    When I send a GET request to "/api/premier-league/summary"
    Then the response status should be 503
    And the response should be JSON
    And the response field "error" should contain "Premier League stats"
    And the response should not be cacheable
