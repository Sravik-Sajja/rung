-- The student refresher panel embeds its video inline; the stored page URL (a Khan Academy
-- page) refuses framing, so recommendations carry a separate embeddable source. Null means
-- link-only: student surfaces fall back to optional, never a mandatory gate.
alter table video_recommendations add column if not exists embed_url text;
