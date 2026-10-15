Feature: Site navigation
  As a visitor to the site
  I want clear tabs for each section and old links that still work
  So that I can find Fionn's content without hitting dead ends

  Scenario Outline: Each tab loads with its own title
    When I visit "<path>"
    Then the response status should be 200
    And the page title should be "<title>"

    Examples:
      | path        | title                               |
      | /           | Fionn Mowlds's blog                 |
      | /man-united | Man United \| Fionn Mowlds's blog   |
      | /rowing     | Rowing \| Fionn Mowlds's blog       |
      | /about-me   | About Me \| Fionn Mowlds's blog     |

  Scenario: The header links to every section
    When I visit "/"
    Then the page should link to "/man-united"
    And the page should link to "/rowing"
    And the page should link to "/about-me"

  Scenario: The site links to Fionn's own profiles, not the starter template's
    When I visit "/"
    Then the page should link to "https://github.com/fionnmowlds07-a11y"
    And the page should link to "https://www.instagram.com/fionnm_/"
    And the page should not link to anything on "astro.build"
    And the page should not link to anything on "twitter.com"

  Scenario Outline: Old URLs redirect permanently to their new home
    When I visit "<old>" without following redirects
    Then I should be permanently redirected to "<new>"

    Examples:
      | old               | new                   |
      | /about            | /about-me             |
      | /blog             | /about-me             |
      | /blog/first-post/ | /about-me/first-post  |
