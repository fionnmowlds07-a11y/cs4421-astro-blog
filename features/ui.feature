Feature: Site look and feel
  As a visitor to the site
  I want each section to have its own colours and smooth navigation
  So that the site feels polished and I always know which section I'm in

  Scenario Outline: Each section declares its colour theme
    When I visit "<path>"
    Then the page should use the "<theme>" theme

    Examples:
      | path        | theme   |
      | /           | neutral |
      | /about-me   | neutral |
      | /man-united | united  |
      | /rowing     | rowing  |

  Scenario: Pages switch smoothly instead of reloading
    When I visit "/"
    Then the page should have smooth page transitions enabled

  Scenario: The home page offers a themed card for each section
    When I visit "/"
    Then the page should have a "united" card linking to "/man-united"
    And the page should have a "rowing" card linking to "/rowing"
