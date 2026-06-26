# data/

Drop the extractor output here as **`endurance-catalogue-full.json`**.

Generate it by running `tools/endurance-catalogue-extractor.js` in the Endurance
trade portal's Door Designer console — see the project README → *Catalogue data*.

The plugin loads this file at runtime and serves it to the configurator over REST
(`/wp-json/hd-door-designer/v1/catalogue`). Until it's present, the configurator
shows a polite "being set up" message and the admin updater notice appears.

To sync after Endurance change options upstream: re-run the extractor and replace
this file. Diff old vs new to see what changed.
