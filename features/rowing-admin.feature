# Like the other features, these describe a server started without Supabase settings, as in CI:
# login is unavailable, but the admin area must still be protected and the origin check must still work.
Feature: Rowing admin login
  As the site owner
  I want a private admin area that only I can log in to
  So that nobody else can change my rowing log

  Scenario: The admin area is never shown without a working login
    When I visit "/rowing/admin"
    Then the response status should be 503
    And the page title should be "Rowing admin | Fionn Mowlds's blog"
    And the page should show the "admin-unavailable" element
    And the page should not show the "admin-area" element
    And the page should ask search engines not to list it
    And the response should not be cacheable

  Scenario: The login page says when login is unavailable
    When I visit "/rowing/login"
    Then the response status should be 503
    And the page title should be "Admin login | Fionn Mowlds's blog"
    And the page should show the "login-unavailable" element
    And the page should ask search engines not to list it
    And the response should not be cacheable

  Scenario: The site's own login form is not mistaken for a cross-site attack
    When I submit the login form on "/rowing/login"
    Then the response status should be 503
    And the page should show the "login-unavailable" element

  Scenario: A login form posted from another website is rejected
    When another website submits a login form to "/rowing/login"
    Then the response status should be 403

  Scenario: Logging out only works as a form post, never as a link
    When I send a GET request to "/rowing/logout"
    Then the response status should be 404
