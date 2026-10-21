# Like the other features, these describe a server started without Supabase settings, as in CI:
# nobody can log in, so every logging page must stay locked and nothing can ever be saved or deleted.
# Saving with a real login is covered by the unit tests for the form checks (src/lib/rowing-forms.test.ts).
Feature: Rowing log admin
  As the site owner
  I want to add, edit and delete my sessions from private admin pages
  So that only I can change my rowing log

  Scenario Outline: The logging pages are never shown without a working login
    When I visit "<page>"
    Then the response status should be 503
    And the page should show the "admin-unavailable" element
    And the page should not show the "<form>" element
    And the page should ask search engines not to list it
    And the response should not be cacheable

    Examples:
      | page                                                            | form           |
      | /rowing/admin/erg/new                                           | erg-form       |
      | /rowing/admin/water/new                                         | outing-form    |
      | /rowing/admin/erg/3f2b8c4e-9a1d-4e5f-8b7a-1c2d3e4f5a6b          | erg-form       |
      | /rowing/admin/water/3f2b8c4e-9a1d-4e5f-8b7a-1c2d3e4f5a6b?delete | delete-confirm |

  Scenario: Logging a session without a working login saves nothing
    When I submit a rowing form to "/rowing/admin/erg/new" with:
      | session_date | 2026-10-20 |
      | session_type | single     |
      | distance_m   | 2000       |
      | time         | 6:12.0     |
      | machine      | concept2   |
    Then the response status should be 503
    And nothing should have been saved

  Scenario: Deleting without a working login deletes nothing
    When I submit a rowing form to "/rowing/admin/erg/3f2b8c4e-9a1d-4e5f-8b7a-1c2d3e4f5a6b?delete" with:
      | intent | delete |
    Then the response status should be 503
    And nothing should have been saved

  Scenario: A session posted from another website is rejected
    When another website submits an erg session to "/rowing/admin/erg/new"
    Then the response status should be 403
    And nothing should have been saved

  Scenario: The Rowing page has a way in for the site owner
    When I visit "/rowing"
    Then the page should show the "admin-link" element
    And the page should link to "/rowing/login"
