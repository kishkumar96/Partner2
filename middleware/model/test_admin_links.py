from django.contrib.auth import get_user_model
from django.urls import reverse

from event.models import Event
from event_type.models import EventType

from .queueing import queue_runs_for_track
from .tests import QueueTestCase, utc


class EventAndRunAdminLinkTests(QueueTestCase):
    """An Event links only the run it shows; the admin must still connect it to the storm's other runs."""

    def setUp(self):
        super().setUp()
        self.rapid.name = "Rapid exposure forecast"
        self.rapid.save()
        self.client.force_login(get_user_model().objects.create_superuser("admin-user", password="x"))
        self.run_a, _, self.event = self.run_to_completion(self.track(utc(8, 12), name="2026040812_VAIANU"))
        self.run_b, _, _ = self.run_to_completion(self.track(utc(8, 18), name="2026040818_VAIANU"))

    def page(self, url):
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, url)
        return response.content.decode()

    def test_the_run_list_says_which_event_each_run_belongs_to(self):
        html = self.page("/partner_api/admin/model/modelrun/")
        event_url = reverse("partner_admin:event_event_change", args=[self.event.pk])

        self.assertEqual(html.count(f'<a href="{event_url}">Event {self.event.pk}</a>'), 2)
        self.assertEqual(html.count("the one it shows"), 1)
        self.assertEqual(html.count("another run of this storm"), 1)

    def test_the_run_page_links_to_its_event(self):
        html = self.page(reverse("partner_admin:model_modelrun_change", args=[self.run_a.pk]))

        self.assertIn(f"Event {self.event.pk}", html)
        self.assertIn("another run of this storm", html)

    def test_the_run_list_shows_how_many_outputs_each_run_has(self):
        html = self.page("/partner_api/admin/model/modelrun/")

        self.assertEqual(html.count('class="field-outputs">1</td>'), 2)

    def test_the_event_page_lists_every_advisory_run_and_marks_the_shown_one(self):
        html = self.page(reverse("partner_admin:event_event_change", args=[self.event.pk]))

        for run in (self.run_a, self.run_b):
            self.assertIn(reverse("partner_admin:model_modelrun_change", args=[run.pk]), html)
        self.assertIn("2026040812_VAIANU", html)
        self.assertIn("2026040818_VAIANU", html)
        self.assertEqual(html.count("shown on this Event"), 1)
        # newest advisory first
        self.assertLess(html.index("2026040818_VAIANU"), html.index("2026040812_VAIANU"))

    def test_an_event_loaded_by_hand_says_it_has_no_runs(self):
        event_type = EventType.objects.create(event_name="Tropical Cyclone")
        by_hand = Event.objects.create(
            title="By hand", event_type=event_type, country=self.to, cyclone_track=self.track(utc(9, 12), country=self.to)
        )

        html = self.page(reverse("partner_admin:event_event_change", args=[by_hand.pk]))

        self.assertIn("None (not a forecast Event", html)

    def test_adding_an_event_still_works(self):
        self.page("/partner_api/admin/event/event/add/")

    def test_the_event_list_still_works(self):
        self.page("/partner_api/admin/event/event/")

    def test_a_queued_run_whose_storm_has_no_event_yet_shows_a_dash(self):
        (queued,) = queue_runs_for_track(self.track(utc(9, 12), country=self.to, name="2026040912_OTHER"))

        html = self.page("/partner_api/admin/model/modelrun/")

        self.assertEqual(html.count("the one it shows"), 1)  # still only the VAIANU Event's
        self.assertIn(f'value="{queued.pk}"', html)  # the queued run is listed
