# Like the other features, these describe a server started without Supabase settings, as in CI:
# the training log can't be loaded, so the page must still work and say so.
# Showing real PBs, sessions and the chart is covered by the unit tests (src/lib/rowing-data.test.ts, split-chart.test.ts).
Feature: Public Rowing page
  As a visitor
  I want to see Fionn's PBs and latest training on the Rowing page
  So that I can follow how the rowing is going

  Scenario: The Rowing page still loads when the training log can't be reached
    When I visit "/rowing"
    Then the response status should be 200
    And the page title should be "Rowing | Fionn Mowlds's blog"
    And the page should use the "rowing" theme
    And the page should show the "rowing-unavailable" element
    And the page should not show the "rowing-pbs" element
    And the page should not show the "split-chart" element

  Scenario: A page that couldn't load the training log is never cached
    When I visit "/rowing"
    Then the response should not be cacheable

  Scenario: The Rowing page is public, unlike the admin pages
    When I visit "/rowing"
    Then the page should let search engines list it
    And the page should show the "admin-link" element
