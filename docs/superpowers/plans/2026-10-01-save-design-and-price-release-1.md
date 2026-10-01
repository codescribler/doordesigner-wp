# Save Your Design and Get a Price — Release 1 (Review Rework) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Get my free quote" on the Review step with "Save my design & get my price": a shorter form (phone optional, no consent tick, a design name), social proof and reassurance, in both designer flows.

**Architecture:** A save is still an enquiry row in `hd_enquiries`, posted to the existing `POST /enquiry`, so the admin list, notification email, quote payload and A/B conversion counting are unchanged. A new PHP class owns the Review-step settings and hands them to the browser in `HD_DD_CONFIG.trust`; a new UMD module `trust.js` draws the proof and benefits block; the shared `enquiry.js` form is reworked; both flows show the form in place under the Review list.

**Tech Stack:** WordPress plugin, PHP 7.4+ (tests run on PHP 8.4), vanilla ES5 JavaScript as UMD modules with no build step, plain-Node and plain-PHP test scripts (no framework).

**Spec:** `docs/superpowers/specs/2026-10-01-save-design-and-price-design.md` — this plan covers the section "Release 1 — Review rework" only. Releases 2 (My designs) and 3 (Estimates) get their own plans.

## Global Constraints

- **Copy rule:** nothing customer-facing (designer, thank-you screen, emails) may say or imply that we will not phone. Allowed: "no pressure", "no obligation", "no hard sell", "no spam". Task 6 adds a test that enforces this by scanning every line of `assets/js/**/*.js` and `includes/*.php`, **code comments included** — so do not write phrases like "won't phone" or "never call" in comments in those files either.
- **Required fields:** design name, name, email, postcode. Phone is optional. No consent tick.
- **Consent line, verbatim:** "By saving you're asking us for a price. We'll use your details to send it and may get in touch about your door." (typographic apostrophes in the UI).
- **Button, verbatim:** "Save my design & get my price".
- **Design name:** max 80 characters; default `<design> in <outside colour>`, e.g. "Ketu in Anthracite Grey".
- **Funnel:** step keys `review` and `details` and the `lead` call keep their names, order and meaning in both `door-designer` and `door-designer-v2`. `details` fires when the form is revealed.
- **Payload:** existing keys and the Endurance headings/labels inside `design` are unchanged. One key is added: top-level `designName`. `customer.telephone` may be `""`.
- **Old clients keep working:** a cached page that still sends `consent` and a phone number, and no `designName`, must save.
- **JavaScript style:** ES5 (`var`, function expressions), UMD wrapper as in `assets/js/wizard/funnel.js`, tabs for indentation in `assets/js/*.js` and `assets/js/swipe/*.js`, two spaces in `assets/js/wizard/*.js`. No new dependencies, no build step.
- **PHP style:** WordPress coding standards as in the surrounding files (tabs, Yoda conditions, spaces inside parentheses), text domain `hd-door-designer`.
- **Files stay short:** new behaviour goes in the new files named below, not into `class-hd-admin.php` (435 lines) or `hd-door-designer.js` beyond the wiring shown.
- **Git:** work on branch `feat/save-design-and-price`. Commit messages have no `Co-Authored-By` line. Do not push, tag or create a GitHub release without Daniel's go-ahead.
- **Tests:** `php tests/php/run.php` and every `node tests/js/*.test.js` must pass at the end of every task.

## Review Focus

Inputs the spec implies but does not spell out, most likely first. Each has a test in the task named.

1. **A blank, whitespace-only or over-long design name** — the save must still succeed, using the default name or the first 80 characters (Task 2).
2. **A phone field filled with something that is not a number** ("call me after 6") — the save must succeed with the phone stored empty, not be rejected (Task 2).
3. **A submission from a cached copy of the old script** (sends `consent`, a phone, no `designName`) — must save and get a default design name (Task 2).
4. **A design name containing quotes, `&` or markup** — must appear correctly escaped in the HTML email and unescaped in the subject, with tags stripped (Task 3).
5. **Review-step settings entered loosely** — rating "4,9" or "11", a count of "0", a quote line with no `|`, blank lines, HTML in a quote — the page must show nothing wrong: bad rating or count hides the line, tags are stripped, a quote without attribution shows without one (Task 1, Task 4).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `includes/class-hd-trust-settings.php` | create | Review-step settings: defaults, sanitising, quote parsing, the `trust` config for the browser, the settings fields |
| `includes/class-hd-plugin.php` | modify | Merge the trust defaults into `settings()` |
| `includes/class-hd-admin.php` | modify | Call the trust class from `sanitize_settings()` and `render_settings()`; show the design name in the list and detail |
| `includes/class-hd-assets.php` | modify | Register `trust.js`; add `trust` to `HD_DD_CONFIG`; new form strings |
| `includes/class-hd-repository.php` | modify | `design_name` column, `DB_VERSION` 3 |
| `includes/class-hd-enquiry.php` | modify | Optional phone, no consent gate, design name, `designName` in the payload |
| `includes/class-hd-failure-log.php` | modify | Drop the now-meaningless "Consent ticked" line |
| `includes/class-hd-mailer.php` | modify | Owner email: design name, "(not given)" phone. Customer email: subject, intro, button |
| `hd-door-designer.php` | modify | `require` the new class; version bump (Task 7) |
| `assets/js/trust.js` | create | Rating line, customer quote, benefits block |
| `assets/js/enquiry.js` | modify | New field set, design name, consent line, thank-you copy |
| `assets/js/wizard/review.js` | modify | Trust block; CTA label; hide the CTA when the form is open |
| `assets/js/hd-door-designer.js` | modify | Classic flow: form opens under the Review list |
| `assets/js/swipe/swipe-view.js`, `assets/js/swipe/swipe-app.js` | modify | Swipe flow: the same |
| `assets/css/hd-door-designer.css` | modify | Styles for the trust block, save box and consent line |
| `tools/preview-test.html`, `tools/swipe-test.html`, `tools/boot-test.html` | modify | Load `trust.js`; sample `trust` config |
| `tests/php/wp-stubs.php` | modify | `require` the new class |
| `tests/php/trust-settings.test.php`, `tests/php/enquiry-save.test.php`, `tests/php/save-emails.test.php` | create | PHP tests |
| `tests/js/trust.test.js`, `tests/js/enquiry-form.test.js`, `tests/js/copy-rule.test.js` | create | Node tests |
| `README.md` | modify | Tests list, settings, privacy note |

---

### Task 1: Review-step settings (PHP)

**Files:**
- Create: `includes/class-hd-trust-settings.php`
- Create: `tests/php/trust-settings.test.php`
- Modify: `tests/php/wp-stubs.php` (the `require_once` block at the bottom)
- Modify: `hd-door-designer.php:46` (the `require_once` block)
- Modify: `includes/class-hd-plugin.php:94-105` (`settings()`)
- Modify: `includes/class-hd-admin.php:94-104` (`sanitize_settings()`), `:159-160` (`render_settings()`)
- Modify: `includes/class-hd-assets.php:155` (the `HD_DD_CONFIG` array)

**Interfaces:**
- Consumes: `HD_DD_Plugin::settings()` (existing).
- Produces:
  - `HD_DD_Trust_Settings::defaults(): array` — keys `proof_rating`, `proof_count`, `proof_url`, `proof_quotes` (all strings).
  - `HD_DD_Trust_Settings::sanitize( array $input, array $current ): array` — the same four keys, cleaned.
  - `HD_DD_Trust_Settings::parse_quotes( string $text ): array` — list of `array( 'text' => string, 'by' => string )`, at most 6.
  - `HD_DD_Trust_Settings::front_config(): array` — `array( 'rating' => string, 'count' => string, 'url' => string, 'quotes' => array )`. `rating` and `count` are both `''` when either setting is empty.
  - `HD_DD_Trust_Settings::render_fields( array $settings, string $option ): void` — echoes the settings rows.
  - In the browser: `window.HD_DD_CONFIG.trust` with the `front_config()` shape (Task 4 and Task 6 read it).

- [ ] **Step 1: Write the failing test**

Create `tests/php/trust-settings.test.php`:

```php
<?php
/**
 * Review-step social proof settings: loose input must never put something wrong on the
 * page. A bad rating or count hides the rating line; quotes are plain text only.
 * Run: php tests/php/trust-settings.test.php
 */
require __DIR__ . '/wp-stubs.php';

// --- 1) Defaults reach HD_DD_Plugin::settings() --------------------------------------
hd_test_reset();
$s = HD_DD_Plugin::settings();
check( '4.9' === $s['proof_rating'], 'default rating is 4.9' );
check( '321' === $s['proof_count'], 'default review count is 321' );
check( '' === $s['proof_url'] && '' === $s['proof_quotes'], 'no link and no quotes by default' );

// --- 2) sanitize(): rating ------------------------------------------------------------
$cur = HD_DD_Trust_Settings::defaults();
$in  = function ( array $over ) use ( $cur ) {
	return HD_DD_Trust_Settings::sanitize( array_merge( $cur, $over ), $cur );
};
check( '4.8' === $in( array( 'proof_rating' => '4.8' ) )['proof_rating'], 'rating kept' );
check( '4.9' === $in( array( 'proof_rating' => '4,9' ) )['proof_rating'], 'comma decimal accepted' );
check( '5.0' === $in( array( 'proof_rating' => '5' ) )['proof_rating'], 'whole number formatted to one decimal' );
check( '' === $in( array( 'proof_rating' => '11' ) )['proof_rating'], 'rating above 5 is dropped' );
check( '' === $in( array( 'proof_rating' => 'great' ) )['proof_rating'], 'non-numeric rating is dropped' );
check( '' === $in( array( 'proof_rating' => '' ) )['proof_rating'], 'rating can be cleared' );

// --- 3) sanitize(): count, link ---------------------------------------------------------
check( '1204' === $in( array( 'proof_count' => '1,204 reviews' ) )['proof_count'], 'count keeps digits only' );
check( '' === $in( array( 'proof_count' => '0' ) )['proof_count'], 'zero count is dropped' );
check( 'https://www.checkatrade.com/trades/x' === $in( array( 'proof_url' => ' https://www.checkatrade.com/trades/x ' ) )['proof_url'], 'link trimmed and kept' );
check( '' === $in( array( 'proof_url' => 'javascript:alert(1)' ) )['proof_url'], 'non-http link is dropped' );

// --- 4) sanitize(): a key missing from the form keeps the current value -------------------
$kept = HD_DD_Trust_Settings::sanitize( array(), array_merge( $cur, array( 'proof_quotes' => 'Lovely | Ann, Ware' ) ) );
check( 'Lovely | Ann, Ware' === $kept['proof_quotes'], 'missing key keeps the current value' );

// --- 5) sanitize() + parse_quotes(): plain text only -------------------------------------
$q = $in( array( 'proof_quotes' => "<b>Brilliant</b> fitters | Sam, St Albans\r\n\r\n  \"Tidy job\" | Jo, Hitchin\nNo attribution here" ) )['proof_quotes'];
check( false === strpos( $q, '<b>' ), 'markup stripped from quotes' );
$parsed = HD_DD_Trust_Settings::parse_quotes( $q );
check( 3 === count( $parsed ), 'three quotes parsed, blank line skipped (got ' . count( $parsed ) . ')' );
check( 'Brilliant fitters' === $parsed[0]['text'] && 'Sam, St Albans' === $parsed[0]['by'], 'text and attribution split on the bar' );
check( 'Tidy job' === $parsed[1]['text'], 'surrounding quote marks removed' );
check( 'No attribution here' === $parsed[2]['text'] && '' === $parsed[2]['by'], 'a line with no bar has no attribution' );
check( 'A | B' === HD_DD_Trust_Settings::parse_quotes( 'A | B | Dee, Tring' )[0]['text'], 'only the LAST bar separates the attribution' );
check( 6 === count( HD_DD_Trust_Settings::parse_quotes( implode( "\n", array_fill( 0, 9, 'Good | A, B' ) ) ) ), 'at most six quotes' );
check( array() === HD_DD_Trust_Settings::parse_quotes( '' ), 'no quotes from an empty setting' );

// --- 6) front_config(): the rating line needs BOTH rating and count ------------------------
hd_test_reset();
$cfg = HD_DD_Trust_Settings::front_config();
check( '4.9' === $cfg['rating'] && '321' === $cfg['count'] && array() === $cfg['quotes'], 'defaults reach the browser config' );
update_option( 'hd_dd_settings', array( 'proof_rating' => '4.9', 'proof_count' => '' ) );
$cfg = HD_DD_Trust_Settings::front_config();
check( '' === $cfg['rating'] && '' === $cfg['count'], 'no count → no rating line at all' );
update_option( 'hd_dd_settings', array( 'proof_rating' => '4.9', 'proof_count' => '1204', 'proof_quotes' => 'Great | Al, Ware' ) );
$cfg = HD_DD_Trust_Settings::front_config();
check( '1,204' === $cfg['count'], 'count is formatted with a thousands separator' );
check( 'Great' === $cfg['quotes'][0]['text'], 'quotes reach the browser config parsed' );

hd_test_done( 'trust-settings.test.php' );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/php/trust-settings.test.php`
Expected: FAIL — `Undefined array key "proof_rating"` warnings and `Class "HD_DD_Trust_Settings" not found`.

- [ ] **Step 3: Create the class**

Create `includes/class-hd-trust-settings.php`:

```php
<?php
/**
 * Review-step social proof: the Checkatrade rating line and real customer quotes shown
 * above "Save my design & get my price". Owns its four settings (stored in the shared
 * hd_dd_settings option), their sanitising, and the shape handed to the browser.
 * Nothing here is invented: with no quotes entered, no quote is shown.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Trust_Settings {

	const QUOTE_MAX = 6;

	/** @return array Setting key => default. */
	public static function defaults() {
		return array(
			'proof_rating' => '4.9',
			'proof_count'  => '321',
			'proof_url'    => '',
			'proof_quotes' => '',
		);
	}

	/**
	 * Clean the four settings from a submitted form. A key missing from $input keeps its
	 * current value; a key present but invalid becomes '' (which hides that element).
	 *
	 * @param array $input   Raw submitted settings.
	 * @param array $current Current settings.
	 * @return array The four trust keys.
	 */
	public static function sanitize( array $input, array $current ) {
		$out = array();
		foreach ( self::defaults() as $key => $default ) {
			if ( ! array_key_exists( $key, $input ) ) {
				$out[ $key ] = isset( $current[ $key ] ) ? (string) $current[ $key ] : $default;
				continue;
			}
			$raw = (string) $input[ $key ];
			if ( 'proof_rating' === $key ) {
				$n           = str_replace( ',', '.', trim( $raw ) );
				$out[ $key ] = ( is_numeric( $n ) && (float) $n > 0 && (float) $n <= 5 ) ? number_format( (float) $n, 1, '.', '' ) : '';
			} elseif ( 'proof_count' === $key ) {
				$n           = (int) preg_replace( '/\D+/', '', $raw );
				$out[ $key ] = $n > 0 ? (string) $n : '';
			} elseif ( 'proof_url' === $key ) {
				$url         = esc_url_raw( trim( $raw ) );
				$out[ $key ] = preg_match( '#^https?://#i', $url ) ? $url : '';
			} else {
				$lines = array();
				foreach ( preg_split( '/\r\n|\r|\n/', $raw ) as $line ) {
					$line = sanitize_text_field( $line );
					if ( '' !== $line ) {
						$lines[] = $line;
					}
				}
				$out[ $key ] = implode( "\n", $lines );
			}
		}
		return $out;
	}

	/**
	 * "Quote text | Name, Town" lines → quotes. The LAST bar separates the attribution, so
	 * a bar inside the quote survives. Lines without a bar have no attribution.
	 *
	 * @param string $text The proof_quotes setting.
	 * @return array[] Each array( 'text' => string, 'by' => string ).
	 */
	public static function parse_quotes( $text ) {
		$quotes = array();
		foreach ( preg_split( '/\r\n|\r|\n/', (string) $text ) as $line ) {
			$line = trim( $line );
			if ( '' === $line ) {
				continue;
			}
			$pos   = strrpos( $line, '|' );
			$quote = false === $pos ? $line : substr( $line, 0, $pos );
			$by    = false === $pos ? '' : substr( $line, $pos + 1 );
			$quote = preg_replace( '/^[\s"\'“”‘’]+|[\s"\'“”‘’]+$/u', '', $quote );
			if ( '' === $quote ) {
				continue;
			}
			$quotes[] = array(
				'text' => $quote,
				'by'   => trim( $by ),
			);
			if ( count( $quotes ) >= self::QUOTE_MAX ) {
				break;
			}
		}
		return $quotes;
	}

	/** The `trust` object for HD_DD_CONFIG (read by assets/js/trust.js). */
	public static function front_config() {
		$s      = HD_DD_Plugin::settings();
		$rating = (string) $s['proof_rating'];
		$count  = (string) $s['proof_count'];
		$show   = '' !== $rating && '' !== $count;
		return array(
			'rating' => $show ? $rating : '',
			'count'  => $show ? number_format( (int) $count ) : '',
			'url'    => esc_url_raw( (string) $s['proof_url'] ),
			'quotes' => self::parse_quotes( (string) $s['proof_quotes'] ),
		);
	}

	/**
	 * The "Review step" block on the settings screen.
	 *
	 * @param array  $s      Current settings.
	 * @param string $option Option name the fields post into.
	 */
	public static function render_fields( array $s, $option ) {
		?>
		<h2><?php esc_html_e( 'Review step', 'hd-door-designer' ); ?></h2>
		<p class="description"><?php esc_html_e( 'Shown above the "Save my design & get my price" button. Only use your real rating and real customer words.', 'hd-door-designer' ); ?></p>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="hd_proof_rating"><?php esc_html_e( 'Checkatrade rating', 'hd-door-designer' ); ?></label></th>
				<td>
					<input name="<?php echo esc_attr( $option ); ?>[proof_rating]" id="hd_proof_rating" type="text" class="small-text" value="<?php echo esc_attr( $s['proof_rating'] ); ?>" />
					<?php esc_html_e( 'from', 'hd-door-designer' ); ?>
					<input name="<?php echo esc_attr( $option ); ?>[proof_count]" id="hd_proof_count" type="text" class="small-text" value="<?php echo esc_attr( $s['proof_count'] ); ?>" aria-label="<?php esc_attr_e( 'Number of reviews', 'hd-door-designer' ); ?>" />
					<?php esc_html_e( 'reviews', 'hd-door-designer' ); ?>
					<p class="description"><?php esc_html_e( 'Leave either box empty to hide the rating line.', 'hd-door-designer' ); ?></p>
				</td>
			</tr>
			<tr>
				<th scope="row"><label for="hd_proof_url"><?php esc_html_e( 'Checkatrade profile link', 'hd-door-designer' ); ?></label></th>
				<td><input name="<?php echo esc_attr( $option ); ?>[proof_url]" id="hd_proof_url" type="url" class="regular-text" value="<?php echo esc_attr( $s['proof_url'] ); ?>" /></td>
			</tr>
			<tr>
				<th scope="row"><label for="hd_proof_quotes"><?php esc_html_e( 'Customer quotes', 'hd-door-designer' ); ?></label></th>
				<td>
					<textarea name="<?php echo esc_attr( $option ); ?>[proof_quotes]" id="hd_proof_quotes" class="large-text" rows="5"><?php echo esc_textarea( $s['proof_quotes'] ); ?></textarea>
					<p class="description"><?php esc_html_e( 'One per line: Quote text | Name, Town. Up to six; one is shown at random. Leave empty to show none.', 'hd-door-designer' ); ?></p>
				</td>
			</tr>
		</table>
		<?php
	}
}
```

- [ ] **Step 4: Load the class and merge its defaults**

In `tests/php/wp-stubs.php`, in the `require_once` block at the bottom, add this line directly above the `class-hd-plugin.php` line:

```php
require_once HD_DD_DIR . 'includes/class-hd-trust-settings.php';
```

In `hd-door-designer.php`, add directly below the `class-hd-mailer.php` line (line 46):

```php
require_once HD_DD_DIR . 'includes/class-hd-trust-settings.php';
```

In `includes/class-hd-plugin.php`, in `settings()`, change the closing of the `$defaults` array from

```php
			'default_flow'    => 'classic', // designer flow when no A/B test runs (see HD_DD_Experiments).
		);
```

to

```php
			'default_flow'    => 'classic', // designer flow when no A/B test runs (see HD_DD_Experiments).
		) + HD_DD_Trust_Settings::defaults(); // Review-step social proof.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `php tests/php/trust-settings.test.php`
Expected: `trust-settings.test.php: all assertions passed`

- [ ] **Step 6: Wire the settings screen and the browser config**

In `includes/class-hd-admin.php`, `sanitize_settings()`: wrap the returned array so the trust keys are saved with it. Replace

```php
		$current = HD_DD_Plugin::settings();
		return array(
```

with

```php
		$current = HD_DD_Plugin::settings();
		$trust   = HD_DD_Trust_Settings::sanitize( is_array( $input ) ? $input : array(), $current );
		return $trust + array(
```

In `render_settings()`, replace

```php
				</table>
				<?php submit_button(); ?>
```

with

```php
				</table>
				<?php HD_DD_Trust_Settings::render_fields( $s, self::OPTION ); ?>
				<?php submit_button(); ?>
```

In `includes/class-hd-assets.php`, in the `HD_DD_CONFIG` array, add above the `'i18n'` line:

```php
				// Review-step social proof: { rating, count, url, quotes: [{ text, by }] } (assets/js/trust.js).
				'trust'          => HD_DD_Trust_Settings::front_config(),
```

- [ ] **Step 7: Run the whole PHP suite**

Run: `php tests/php/run.php`
Expected: every file prints `all assertions passed`, ending `all PHP tests passed`.

Run: `php -l includes/class-hd-admin.php && php -l includes/class-hd-assets.php && php -l includes/class-hd-trust-settings.php`
Expected: `No syntax errors detected` three times.

- [ ] **Step 8: Commit**

```bash
git add includes/class-hd-trust-settings.php includes/class-hd-plugin.php includes/class-hd-admin.php includes/class-hd-assets.php hd-door-designer.php tests/php/wp-stubs.php tests/php/trust-settings.test.php
git commit -m "feat(review): settings for the Checkatrade rating and customer quotes"
```

---

### Task 2: Save endpoint — optional phone, no consent gate, design name

**Files:**
- Create: `tests/php/enquiry-save.test.php`
- Modify: `includes/class-hd-repository.php:14` (`DB_VERSION`), `:49-67` (table SQL), `:86-102` (`insert()`)
- Modify: `includes/class-hd-enquiry.php:122-148` (validation), `:150-215` (persist + response), `:322-342` (`build_payload()`)
- Modify: `includes/class-hd-failure-log.php:97` and `:187`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `POST /hd-door-designer/v1/enquiry` accepts `designName` (string, optional); `telephone` and `consent` are optional.
  - `HD_DD_Enquiry::default_design_name( array $design ): string` (public static).
  - `HD_DD_Repository::insert()` accepts `$data['design_name']` (string, optional) and stores it in column `design_name`.
  - The stored and emailed payload has top-level `designName` (string). Task 3 reads `$payload['designName']`.

- [ ] **Step 1: Write the failing test**

Create `tests/php/enquiry-save.test.php`:

```php
<?php
/**
 * "Save my design & get my price": name, email and postcode are required; phone and the
 * old consent tick are not; every save carries a design name (the customer's, or a
 * default built from the door).  Run: php tests/php/enquiry-save.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_test_save( array $overrides = array(), array $remove = array() ) {
	$enq  = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
	$body = array_merge(
		array(
			'hd_hp'      => '',
			'designName' => 'Front door option 1',
			'name'       => 'Real Customer',
			'email'      => 'real@example.com',
			'postcode'   => 'AL1 1AA',
			'design'     => array(
				'Door Type'              => array( 'label' => 'Single Door', 'id' => null ),
				'Door Design'            => array( 'label' => 'Ketu', 'id' => 12 ),
				'Door Colour (External)' => array( 'label' => 'Anthracite Grey ', 'id' => 3 ),
			),
			'pageUrl'    => 'https://example.test/door-designer/',
		),
		$overrides
	);
	foreach ( $remove as $k ) {
		unset( $body[ $k ] );
	}
	return $enq->rest_submit( hd_test_request( 'POST', '/hd-door-designer/v1/enquiry', $body ) );
}
function hd_test_last_row() {
	global $wpdb;
	return $wpdb->rows ? $wpdb->rows[ count( $wpdb->rows ) - 1 ] : array();
}

// --- 1) No phone, no consent: saved ---------------------------------------------------
hd_test_reset();
$res = hd_test_save();
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'a save with no phone and no consent tick is accepted' );
$row = hd_test_last_row();
check( isset( $row['customer_phone'] ) && '' === $row['customer_phone'], 'phone stored empty' );
check( isset( $row['design_name'] ) && 'Front door option 1' === $row['design_name'], 'design name stored on the row' );
$payload = isset( $row['payload'] ) ? json_decode( $row['payload'], true ) : array();
check( isset( $payload['designName'] ) && 'Front door option 1' === $payload['designName'], 'payload carries designName' );
check( isset( $payload['customer'] ) && array_key_exists( 'telephone', $payload['customer'] ) && '' === $payload['customer']['telephone'], 'payload keeps customer.telephone as an empty string' );
check( isset( $payload['design']['Door Design']['label'] ) && 'Ketu' === $payload['design']['Door Design']['label'], 'design headings unchanged' );
check( ! empty( $res->get_data()['token'] ), 'response still carries the reload token' );

// --- 2) Name, email and postcode are still required -------------------------------------
foreach ( array( 'name' => '', 'email' => 'not-an-email', 'postcode' => 'nope' ) as $field => $bad ) {
	hd_test_reset();
	$res = hd_test_save( array( $field => $bad ) );
	check( is_wp_error( $res ) && 'hd_dd_validation' === $res->get_error_code(), "a bad $field is rejected" );
	$fields = is_wp_error( $res ) ? $res->get_error_data()['fields'] : array();
	check( isset( $fields[ $field ] ) && ! isset( $fields['telephone'] ), "the error names $field and never the phone" );
	check( array() === hd_test_last_row(), "nothing stored for a bad $field" );
}

// --- 3) Design name: blank, whitespace, too long, markup ------------------------------
hd_test_reset();
hd_test_save( array( 'designName' => '' ) );
check( 'Ketu in Anthracite Grey' === hd_test_last_row()['design_name'], 'blank name → default from the door (got "' . hd_test_last_row()['design_name'] . '")' );

hd_test_reset();
hd_test_save( array( 'designName' => "   \t " ) );
check( 'Ketu in Anthracite Grey' === hd_test_last_row()['design_name'], 'whitespace-only name → default' );

hd_test_reset();
$res = hd_test_save( array( 'designName' => str_repeat( 'é', 200 ) ) );
check( ! is_wp_error( $res ), 'an over-long name is accepted, not rejected' );
check( 80 === mb_strlen( hd_test_last_row()['design_name'] ), 'over-long name cut to 80 characters (got ' . mb_strlen( hd_test_last_row()['design_name'] ) . ')' );

hd_test_reset();
hd_test_save( array( 'designName' => '<b>Garage</b> door' ) );
check( 'Garage door' === hd_test_last_row()['design_name'], 'markup stripped from the name' );

check( 'Ketu' === HD_DD_Enquiry::default_design_name( array( 'Door Design' => array( 'label' => 'Ketu' ) ) ), 'default with no colour is just the design' );
check( 'Avantal 1 in Black' === HD_DD_Enquiry::default_design_name( array( 'Door Style' => array( 'label' => 'Avantal 1' ), 'Door Colour' => array( 'label' => 'Black' ) ) ), 'default uses Door Style / Door Colour when those are the headings' );
check( 'My door' === HD_DD_Enquiry::default_design_name( array() ), 'default with no design at all' );

// --- 4) Phone that is not a number: saved, phone empty ----------------------------------
hd_test_reset();
$res = hd_test_save( array( 'telephone' => 'call me after six' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'junk in the phone box does not block the save' );
check( '' === hd_test_last_row()['customer_phone'], 'junk phone stored empty' );

hd_test_reset();
hd_test_save( array( 'telephone' => '01234 567890' ) );
check( '01234 567890' === hd_test_last_row()['customer_phone'], 'a real phone number is still stored' );

// --- 5) A cached copy of the OLD script: consent + phone, no designName -----------------
hd_test_reset();
$res = hd_test_save( array( 'consent' => true, 'telephone' => '01234 567890' ), array( 'designName' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'old-script submission still saves' );
check( 'Ketu in Anthracite Grey' === hd_test_last_row()['design_name'], 'old-script submission gets the default name' );

// --- 6) Still an enquiry: both emails, the hook, the schema version ------------------------
hd_test_reset();
$fired = 0;
add_action( 'hd_dd_enquiry_submitted', function () use ( &$fired ) { $fired++; }, 10, 2 );
hd_test_save();
check( 1 === $fired, 'hd_dd_enquiry_submitted fires once (A/B conversions keep counting)' );
check( 2 === count( $GLOBALS['hd_test_mail'] ), 'owner notification and customer email both sent' );
check( '3' === HD_DD_Repository::DB_VERSION, 'schema version bumped so the design_name column is added on update' );

hd_test_done( 'enquiry-save.test.php' );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/php/enquiry-save.test.php`
Expected: FAIL — first line `FAIL: a save with no phone and no consent tick is accepted`, more failures after it.

- [ ] **Step 3: Add the column to the repository**

In `includes/class-hd-repository.php`:

Change `const DB_VERSION = '2';` to `const DB_VERSION = '3';`.

In the `CREATE TABLE` SQL, add a line directly below `customer_postcode VARCHAR(16) NOT NULL DEFAULT '',`:

```php
			design_name VARCHAR(120) NOT NULL DEFAULT '',
```

In `insert()`, add to the data array directly below the `'customer_postcode'` line:

```php
				'design_name'       => isset( $data['design_name'] ) ? (string) $data['design_name'] : '',
```

and add one more `'%s'` to that call's format array (it must now have 12 entries):

```php
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
```

Leave `insert_failure()` alone: the column's default covers it.

- [ ] **Step 4: Relax validation and store the name**

In `includes/class-hd-enquiry.php`, `rest_submit()`:

Delete the whole consent block (the comment line `// --- Consent (GDPR) ---…` and the `if ( empty( $params['consent'] ) ) { … }` that follows it).

Delete these three lines:

```php
		if ( '' === $telephone ) {
			$errors['telephone'] = __( 'Please enter a contact number.', 'hd-door-designer' );
		}
```

Directly below the `if ( empty( $design ) ) { … }` block, add:

```php
		$design_name = $this->clean_design_name( isset( $params['designName'] ) ? $params['designName'] : '', $design );
```

In the `$this->repository->insert( array( … ) )` call, add below the `'postcode'` line:

```php
				'design_name' => $design_name,
```

Change the `build_payload()` call to pass the name:

```php
		$payload = $this->build_payload( $saved['reference'], compact( 'name', 'email', 'telephone', 'postcode' ), $design, $design_name );
```

Change the response message to:

```php
				'message'   => __( 'Thank you — your design is saved. We will send your price shortly.', 'hd-door-designer' ),
```

Replace `build_payload()`'s signature and returned array head:

```php
	private function build_payload( $reference, array $customer, array $design, $design_name = '' ) {
```

```php
		return array(
			'reference'   => $reference,
			'designName'  => $design_name,
			'submittedAt' => gmdate( 'c' ),
```

Add these two methods directly above `build_reload_url()`:

```php
	/**
	 * The customer's own name for this design ("Front door option 1"), plain text, at most
	 * 80 characters. Blank falls back to a name built from the door, so every save has one.
	 */
	private function clean_design_name( $raw, array $design ) {
		$name = sanitize_text_field( wp_unslash( (string) $raw ) );
		if ( '' === $name ) {
			$name = self::default_design_name( $design );
		}
		return function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 80 ) : substr( $name, 0, 80 );
	}

	/** "Ketu in Anthracite Grey" — the same default assets/js/enquiry.js pre-fills. */
	public static function default_design_name( array $design ) {
		$pick = function ( array $headings ) use ( $design ) {
			foreach ( $headings as $heading ) {
				if ( isset( $design[ $heading ]['label'] ) && '' !== trim( (string) $design[ $heading ]['label'] ) ) {
					return trim( (string) $design[ $heading ]['label'] );
				}
			}
			return '';
		};
		$style  = $pick( array( 'Door Design', 'Door Style' ) );
		$colour = $pick( array( 'Door Colour (External)', 'Door Colour' ) );
		if ( '' === $style ) {
			return __( 'My door', 'hd-door-designer' );
		}
		/* translators: 1: door design, 2: outside colour */
		return '' === $colour ? $style : sprintf( __( '%1$s in %2$s', 'hd-door-designer' ), $style, $colour );
	}
```

- [ ] **Step 5: Remove the stale consent line from the failure log**

In `includes/class-hd-failure-log.php`, delete line 97:

```php
				'consent'   => ! empty( $params['consent'] ),
```

and delete line 187:

```php
		$lines[] = sprintf( '%-16s %s', 'Consent ticked:', $r['consent'] ? 'yes' : 'no' );
```

(With no tick box the line would read "no" on every failure email.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `php tests/php/enquiry-save.test.php`
Expected: `enquiry-save.test.php: all assertions passed`

Run: `php tests/php/run.php`
Expected: `all PHP tests passed` (the honeypot, failure-log and experiment tests still send `consent` and a phone — that is the old-client path and must keep passing).

- [ ] **Step 7: Commit**

```bash
git add includes/class-hd-repository.php includes/class-hd-enquiry.php includes/class-hd-failure-log.php tests/php/enquiry-save.test.php
git commit -m "feat(enquiry): saving needs name, email and postcode only; every save has a design name"
```

---

### Task 3: Emails and wp-admin show the saved design

**Files:**
- Create: `tests/php/save-emails.test.php`
- Modify: `includes/class-hd-mailer.php:68-96` (`send_customer_ack()`), `:103-159` (`customer_ack_html()`), `:162-213` (`build_body()`)
- Modify: `includes/class-hd-admin.php:241` (list), `:337-338` (detail)

**Interfaces:**
- Consumes: `$payload['designName']` and `customer.telephone === ''` from Task 2; row property `design_name`.
- Produces: no new functions. Customer email subject format `Your saved door design: <name> (<reference>)`.

- [ ] **Step 1: Write the failing test**

Create `tests/php/save-emails.test.php`:

```php
<?php
/**
 * The two emails a save sends: Daniel's notification (design name, "(not given)" for a
 * missing phone) and the customer's (saved + price to follow + a link back), with an
 * awkward design name escaped correctly.  Run: php tests/php/save-emails.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_test_mails( array $overrides = array() ) {
	hd_test_reset();
	$enq  = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
	$body = array_merge(
		array(
			'hd_hp'      => '',
			'designName' => 'Front door option 1',
			'name'       => 'Real Customer',
			'email'      => 'real@example.com',
			'postcode'   => 'AL1 1AA',
			'design'     => array(
				'Door Type'   => array( 'label' => 'Single Door', 'id' => null ),
				'Door Design' => array( 'label' => 'Ketu', 'id' => 12 ),
			),
			'pageUrl'    => 'https://example.test/door-designer/',
		),
		$overrides
	);
	$enq->rest_submit( hd_test_request( 'POST', '/hd-door-designer/v1/enquiry', $body ) );
	return $GLOBALS['hd_test_mail'];
}

// --- 1) Owner notification ---------------------------------------------------------------
$mail = hd_test_mails();
check( 2 === count( $mail ), 'two emails sent' );
$owner = $mail[0];
check( 0 === strpos( $owner['subject'], 'New door enquiry HD-' ), 'owner subject unchanged (inbox filters depend on it)' );
check( false !== strpos( $owner['message'], 'Front door option 1' ), 'owner body shows the design name' );
check( false !== strpos( $owner['message'], '(not given)' ), 'owner body says the phone was not given' );
check( false !== strpos( $owner['message'], '"designName": "Front door option 1"' ), 'JSON block carries designName' );

$mail = hd_test_mails( array( 'telephone' => '01234 567890' ) );
check( false !== strpos( $mail[0]['message'], '01234 567890' ) && false === strpos( $mail[0]['message'], '(not given)' ), 'a given phone is printed as before' );

// --- 2) Customer email -------------------------------------------------------------------
$mail = hd_test_mails();
$cust = $mail[1];
check( 'real@example.com' === $cust['to'], 'customer email goes to the customer' );
check( 1 === preg_match( '/^Your saved door design: Front door option 1 \(HD-\d{4}-\d{6}\)$/', $cust['subject'] ), 'customer subject names the design (got "' . $cust['subject'] . '")' );
check( false !== strpos( $cust['message'], 'Open my design' ), 'button says Open my design' );
check( false !== strpos( $cust['message'], 'https://example.test/door-designer/?design=' ), 'button links back to the design' );
check( false !== strpos( $cust['message'], 'is saved' ) && false !== strpos( $cust['message'], 'price' ), 'body says it is saved and a price will follow' );
check( false !== strpos( $cust['message'], 'Front door option 1' ), 'body shows the design name' );

// --- 3) An awkward design name -------------------------------------------------------------
$mail = hd_test_mails( array( 'designName' => 'Mum\'s "big" door & porch <script>x</script>' ) );
$cust = $mail[1];
check( false !== strpos( $cust['subject'], 'Mum\'s "big" door & porch' ), 'subject carries the name unescaped (got "' . $cust['subject'] . '")' );
check( false === strpos( $cust['subject'], '<' ), 'no markup in the subject' );
check( false !== strpos( $cust['message'], 'Mum&#039;s &quot;big&quot; door &amp; porch' ), 'HTML body escapes the name' );
check( false === strpos( $cust['message'], '<script>' ), 'no script tag reaches the HTML body' );

// --- 4) Copy rule: no email promises that we will not phone ------------------------------------
$banned = '/\bno\s+(sales\s+|cold\s+)?calls?\b|\b(won[’\']?t|will not|never|don[’\']?t)\s+(call|phone|ring)\b|\bonly\s+(call|phone|ring)\s+(you|if)\b/i';
check( 0 === preg_match( $banned, $mail[0]['message'] . $mail[1]['message'] ), 'neither email promises not to call' );

hd_test_done( 'save-emails.test.php' );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/php/save-emails.test.php`
Expected: FAIL — including `owner body says the phone was not given` and `customer subject names the design`.

- [ ] **Step 3: Update the owner notification**

In `includes/class-hd-mailer.php`, `build_body()`:

Directly below the `REFERENCE:` line, add:

```php
		if ( ! empty( $payload['designName'] ) ) {
			$lines[] = __( 'DESIGN:    ', 'hd-door-designer' ) . $payload['designName'];
		}
```

Replace the `Telephone:` line with:

```php
		$lines[] = sprintf( "%-12s %s", __( 'Telephone:', 'hd-door-designer' ), ( isset( $c['telephone'] ) && '' !== $c['telephone'] ) ? $c['telephone'] : __( '(not given)', 'hd-door-designer' ) );
```

- [ ] **Step 4: Update the customer email**

In `send_customer_ack()`, replace the subject lines

```php
		/* translators: %s: enquiry reference */
		$subject = sprintf( __( 'Your Hertfordshire Doors design (%s)', 'hd-door-designer' ), $reference );
```

with

```php
		$design_name = isset( $payload['designName'] ) ? (string) $payload['designName'] : '';
		$subject     = '' !== $design_name
			/* translators: 1: the customer's name for the design, 2: enquiry reference */
			? sprintf( __( 'Your saved door design: %1$s (%2$s)', 'hd-door-designer' ), $design_name, $reference )
			/* translators: %s: enquiry reference */
			: sprintf( __( 'Your saved door design (%s)', 'hd-door-designer' ), $reference );
```

In `customer_ack_html()`:

Change the button label `esc_html__( 'Revisit or tweak this design', 'hd-door-designer' )` to `esc_html__( 'Open my design', 'hd-door-designer' )`.

Replace the `$intro` line with:

```php
		$intro = esc_html__( 'Your design is saved. Use the button below to come back to it any time. We will work out a price for this exact door and send it to you, usually within one working day.', 'hd-door-designer' );
```

Directly above the `return` statement add:

```php
		$design_title = ( isset( $payload['designName'] ) && '' !== $payload['designName'] ) ? esc_html( $payload['designName'] ) : esc_html__( 'Your design', 'hd-door-designer' );
```

and in the returned HTML replace `esc_html__( 'Your design', 'hd-door-designer' )` (inside the `font-weight:700` div) with `$design_title`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `php tests/php/save-emails.test.php`
Expected: `save-emails.test.php: all assertions passed`

Run: `php tests/php/run.php`
Expected: `all PHP tests passed`

- [ ] **Step 6: Show the design name in wp-admin**

In `includes/class-hd-admin.php`, `render_list()`, in the Reference cell (line 241), directly before `<?php echo self::status_badge(` add:

```php
<?php if ( ! empty( $row->design_name ) ) : ?><br><small><?php echo esc_html( $row->design_name ); ?></small><?php endif; ?>
```

In `render_detail()`, directly below the `Received` table row (line 337), add:

```php
							<?php if ( ! empty( $row->design_name ) ) : ?>
								<tr><th><?php esc_html_e( 'Design name', 'hd-door-designer' ); ?></th><td><?php echo esc_html( $row->design_name ); ?></td></tr>
							<?php endif; ?>
```

Run: `php -l includes/class-hd-admin.php`
Expected: `No syntax errors detected`

(There is no harness for the admin HTML; it is checked on the live site in Task 7.)

- [ ] **Step 7: Commit**

```bash
git add includes/class-hd-mailer.php includes/class-hd-admin.php tests/php/save-emails.test.php
git commit -m "feat(mail): saved-design emails name the design; a missing phone reads '(not given)'"
```

---

### Task 4: `trust.js` — rating, quote and benefits block

**Files:**
- Create: `assets/js/trust.js`
- Create: `tests/js/trust.test.js`
- Modify: `assets/css/hd-door-designer.css` (after the `.hd-dd__review-note` rule, about line 384)

**Interfaces:**
- Consumes: the `trust` object shape from Task 1: `{ rating: string, count: string, url: string, quotes: [{ text: string, by: string }] }`. It may be `undefined` (QA harness, old cached config).
- Produces (global `HD_DD_Trust`, also `module.exports`):
  - `COPY` — `{ heading: string, benefits: string[3], cta: string }`.
  - `ratingLine(trust)` → `{ text: string, url: string } | null`.
  - `pickQuote(trust, rand)` → `{ text, by } | null`; `rand` is an optional function returning 0–1 (defaults to `Math.random`).
  - `render(container, trust, rand)` → the appended element. Always renders the heading and benefits; rating and quote only when present.

- [ ] **Step 1: Write the failing test**

Create `tests/js/trust.test.js`:

```js
// Review-step social proof + benefits block. `node tests/js/trust.test.js`
var assert = require('assert');

// A minimal document: enough for trust.js to build elements we can inspect.
function node(tag) {
  return {
    tag: tag, className: '', textContent: '', children: [], attrs: {},
    appendChild: function (c) { this.children.push(c); return c; },
    setAttribute: function (k, v) { this.attrs[k] = v; }
  };
}
global.document = { createElement: node };
var Trust = require('../../assets/js/trust.js');

function find(n, cls) {
  if (n.className === cls) { return n; }
  for (var i = 0; i < n.children.length; i++) { var r = find(n.children[i], cls); if (r) { return r; } }
  return null;
}
function text(n) { return n.textContent + n.children.map(text).join(''); }

var full = { rating: '4.9', count: '321', url: 'https://www.checkatrade.com/trades/x', quotes: [{ text: 'Tidy job', by: 'Jo, Hitchin' }, { text: 'Lovely door', by: '' }] };

// Rating line needs both a rating and a count.
assert.deepStrictEqual(Trust.ratingLine(full), { text: '★ 4.9 on Checkatrade · 321 reviews', url: 'https://www.checkatrade.com/trades/x' });
assert.strictEqual(Trust.ratingLine({ rating: '4.9', count: '' }), null);
assert.strictEqual(Trust.ratingLine({ rating: '', count: '321' }), null);
assert.strictEqual(Trust.ratingLine(undefined), null);
// Only http(s) links are used.
assert.strictEqual(Trust.ratingLine({ rating: '4.9', count: '321', url: 'javascript:alert(1)' }).url, '');

// One quote, chosen by the random source; never out of range.
assert.strictEqual(Trust.pickQuote(full, function () { return 0; }).text, 'Tidy job');
assert.strictEqual(Trust.pickQuote(full, function () { return 0.99; }).text, 'Lovely door');
assert.strictEqual(Trust.pickQuote(full, function () { return 1; }).text, 'Lovely door');
assert.strictEqual(Trust.pickQuote({ quotes: [] }), null);
assert.strictEqual(Trust.pickQuote(undefined), null);

// Full render: linked rating, quote with attribution, heading, three benefits.
var c = node('div');
Trust.render(c, full, function () { return 0; });
var rating = find(c, 'hd-dd__trust-rating');
assert.strictEqual(rating.tag, 'a');
assert.strictEqual(rating.href, 'https://www.checkatrade.com/trades/x');
assert.strictEqual(rating.rel, 'noopener');
assert.ok(text(find(c, 'hd-dd__trust-quote')).indexOf('Tidy job') !== -1);
assert.ok(text(find(c, 'hd-dd__trust-quote')).indexOf('Jo, Hitchin') !== -1);
assert.strictEqual(find(c, 'hd-dd__trust-heading').textContent, 'Save this design and get your price');
assert.strictEqual(find(c, 'hd-dd__trust-benefits').children.length, 3);

// A quote with no attribution shows no attribution line.
c = node('div');
Trust.render(c, full, function () { return 0.99; });
assert.strictEqual(find(c, 'hd-dd__trust-quote').children.length, 1);

// No link → the rating is plain text, not a link.
c = node('div');
Trust.render(c, { rating: '4.9', count: '321', url: '', quotes: [] });
assert.strictEqual(find(c, 'hd-dd__trust-rating').tag, 'div');
assert.strictEqual(find(c, 'hd-dd__trust-quote'), null);

// Nothing configured (or no config at all): the benefits still render, and nothing else.
[undefined, {}, { rating: '', count: '', url: '', quotes: [] }].forEach(function (t) {
  var box = node('div');
  Trust.render(box, t);
  assert.strictEqual(find(box, 'hd-dd__trust-rating'), null);
  assert.strictEqual(find(box, 'hd-dd__trust-quote'), null);
  assert.strictEqual(find(box, 'hd-dd__trust-benefits').children.length, 3);
});

assert.strictEqual(Trust.COPY.cta, 'Save my design & get my price');

console.log('trust.test.js: all assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/js/trust.test.js`
Expected: FAIL — `Cannot find module '../../assets/js/trust.js'`.

- [ ] **Step 3: Write the module**

Create `assets/js/trust.js`:

```js
// assets/js/trust.js
// The block above "Save my design & get my price" on the Review step, in both flows: the
// Checkatrade rating line, one real customer quote, and what saving gets you. The rating and
// quotes come from wp-admin settings via HD_DD_CONFIG.trust; with none set, only the benefits
// show. Copy rule: nothing here may make a promise about phone calls
// (tests/js/copy-rule.test.js scans every line of this file, comments included).
//
//   HD_DD_Trust.render(container, HD_DD_CONFIG.trust);
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_Trust = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var COPY = {
		heading: 'Save this design and get your price',
		benefits: [
			'We’ll email you a link so you can come back to it any time',
			'We’ll work out a price for this exact door and send it to you',
			'No pressure and no obligation. You decide what happens next.'
		],
		cta: 'Save my design & get my price'
	};

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	// The rating line needs both figures; a link is used only if it is http(s).
	function ratingLine(trust) {
		if (!trust || !trust.rating || !trust.count) { return null; }
		var url = /^https?:\/\//i.test(trust.url || '') ? trust.url : '';
		return { text: '★ ' + trust.rating + ' on Checkatrade · ' + trust.count + ' reviews', url: url };
	}

	function pickQuote(trust, rand) {
		var quotes = trust && trust.quotes;
		if (!quotes || !quotes.length) { return null; }
		var i = Math.floor((rand || Math.random)() * quotes.length);
		return quotes[Math.min(quotes.length - 1, Math.max(0, i))];
	}

	function render(container, trust, rand) {
		var box = el('div', 'hd-dd__trust');

		var line = ratingLine(trust);
		if (line) {
			var rating = el(line.url ? 'a' : 'div', 'hd-dd__trust-rating', line.text);
			if (line.url) { rating.href = line.url; rating.target = '_blank'; rating.rel = 'noopener'; }
			box.appendChild(rating);
		}

		var quote = pickQuote(trust, rand);
		if (quote) {
			var fig = el('figure', 'hd-dd__trust-quote');
			fig.appendChild(el('blockquote', null, '“' + quote.text + '”'));
			if (quote.by) { fig.appendChild(el('figcaption', null, '— ' + quote.by)); }
			box.appendChild(fig);
		}

		box.appendChild(el('div', 'hd-dd__trust-heading', COPY.heading));
		var list = el('ul', 'hd-dd__trust-benefits');
		COPY.benefits.forEach(function (b) { list.appendChild(el('li', null, b)); });
		box.appendChild(list);

		container.appendChild(box);
		return box;
	}

	return { COPY: COPY, ratingLine: ratingLine, pickQuote: pickQuote, render: render };
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/js/trust.test.js`
Expected: `trust.test.js: all assertions passed`

- [ ] **Step 5: Add the styles**

In `assets/css/hd-door-designer.css`, directly after the `.hd-dd__review-note { … }` rule, add:

```css
/* Review step: social proof + what saving gets you (assets/js/trust.js). */
.hd-dd__trust {
  margin: 20px 16px 0;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.hd-dd__trust-rating {
  display: block;
  color: inherit;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}
a.hd-dd__trust-rating:hover { text-decoration: underline; }
.hd-dd__trust-quote { margin: 8px 0 0; }
.hd-dd__trust-quote blockquote {
  margin: 0;
  font-size: 14px;
  font-style: italic;
  line-height: 1.45;
}
.hd-dd__trust-quote figcaption {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12.5px;
}
.hd-dd__trust-heading {
  margin-top: 16px;
  font-size: 16px;
  font-weight: 700;
}
.hd-dd__trust-benefits {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.5;
}

/* The save form, opened in place under the Review list. */
.hd-dd__savebox { margin-top: 8px; }
.hd-dd__form-consentline {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.4;
}
```

- [ ] **Step 6: Commit**

```bash
git add assets/js/trust.js tests/js/trust.test.js assets/css/hd-door-designer.css
git commit -m "feat(review): trust block — Checkatrade rating, a customer quote, what saving gets you"
```

---

### Task 5: The save form (`enquiry.js`)

**Files:**
- Modify: `assets/js/enquiry.js` (whole `create()` body: `renderForm`, `buildForm`, `submit`, `renderSuccess`, `reset`; the module's return)
- Create: `tests/js/enquiry-form.test.js`
- Modify: `includes/class-hd-assets.php:177-195` (`i18n_strings()`)

**Interfaces:**
- Consumes: `POST /enquiry` accepting `designName` and an optional `telephone` (Task 2).
- Produces (on `HD_DD_Enquiry`, alongside the existing `create`, `snapshot`, `cleanDesign`):
  - `FIELDS` — array of `{ name, label, type, autocomplete, required, maxLength? }` in display order: `designName`, `name`, `email`, `postcode`, `telephone`.
  - `defaultDesignName(design)` → string.
  - `buildData(values, design, pageUrl)` → the POST body object (no `consent` key).
  - `create(o)` returns `{ renderForm(container), renderSuccess(container, result, onAgain), reset() }` — signatures unchanged. `renderForm` still empties the container it is given; Task 6 passes it a dedicated box.

- [ ] **Step 1: Write the failing test**

Create `tests/js/enquiry-form.test.js`:

```js
// The save form's field set, default design name and POST body. `node tests/js/enquiry-form.test.js`
var assert = require('assert');
var Enquiry = require('../../assets/js/enquiry.js');

// Field order and which are required: phone is last and optional; there is no consent field.
assert.deepStrictEqual(Enquiry.FIELDS.map(function (f) { return f.name; }), ['designName', 'name', 'email', 'postcode', 'telephone']);
assert.deepStrictEqual(Enquiry.FIELDS.filter(function (f) { return !f.required; }).map(function (f) { return f.name; }), ['telephone']);
assert.strictEqual(Enquiry.FIELDS[0].maxLength, 80);
assert.strictEqual(Enquiry.FIELDS[4].label, 'Phone (optional)');

// Default design name: "<design> in <outside colour>", trimmed (Endurance labels carry trailing spaces).
assert.strictEqual(Enquiry.defaultDesignName({ 'Door Design': { label: 'Ketu' }, 'Door Colour (External)': { label: 'Anthracite Grey ' } }), 'Ketu in Anthracite Grey');
assert.strictEqual(Enquiry.defaultDesignName({ 'Door Style': { label: 'Avantal 1' }, 'Door Colour': { label: 'Black' } }), 'Avantal 1 in Black');
assert.strictEqual(Enquiry.defaultDesignName({ 'Door Design': { label: 'Ketu' } }), 'Ketu');
assert.strictEqual(Enquiry.defaultDesignName({}), 'My door');
assert.strictEqual(Enquiry.defaultDesignName(null), 'My door');
// A long default is cut to the field's limit.
assert.strictEqual(Enquiry.defaultDesignName({ 'Door Design': { label: new Array(101).join('x') } }).length, 80);

// POST body: UI-only "_" keys are stripped from the design; no consent; phone may be empty.
var body = Enquiry.buildData(
  { designName: ' Front door option 1 ', name: 'Sam', email: 'sam@example.com', postcode: 'AL1 1AA', telephone: '', hd_hp: '' },
  { 'Door Design': { label: 'Ketu', id: 12 }, _styleCategory: 'Glazed' },
  'https://example.test/door-designer/'
);
assert.deepStrictEqual(Object.keys(body).sort(), ['design', 'designName', 'email', 'hd_hp', 'name', 'pageUrl', 'postcode', 'telephone']);
assert.strictEqual(body.designName, 'Front door option 1');
assert.strictEqual(body.telephone, '');
assert.strictEqual(body.design._styleCategory, undefined);
assert.strictEqual(body.design['Door Design'].id, 12);
assert.strictEqual(body.pageUrl, 'https://example.test/door-designer/');

console.log('enquiry-form.test.js: all assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/js/enquiry-form.test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'map')`.

- [ ] **Step 3: Add the pure helpers**

In `assets/js/enquiry.js`, update the header comment's first lines to:

```js
// assets/js/enquiry.js
// The "save my design & get my price" form, submit, thank-you screen and door snapshot —
// shared by the classic wizard and the swipe flow so the part that actually produces leads
// is identical in both. A save is an enquiry: it is stored, emailed to us, and counts as a lead.
```

Directly below the `cleanDesign` function, add:

```js
	// Display order. Phone is last and optional; there is no consent tick (see the line under
	// the button). designName is the customer's own label for this door.
	var FIELDS = [
		{ name: 'designName', label: 'Name this design', type: 'text', autocomplete: 'off', required: true, maxLength: 80 },
		{ name: 'name', label: 'Your name', type: 'text', autocomplete: 'name', required: true },
		{ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', required: true },
		{ name: 'postcode', label: 'Post code', type: 'text', autocomplete: 'postal-code', required: true },
		{ name: 'telephone', label: 'Phone (optional)', type: 'tel', autocomplete: 'tel', required: false }
	];

	// "Ketu in Anthracite Grey" — the same default HD_DD_Enquiry::default_design_name() uses.
	function defaultDesignName(design) {
		function pick(headings) {
			for (var i = 0; i < headings.length; i++) {
				var c = design && design[headings[i]];
				var label = c && c.label != null ? String(c.label).trim() : '';
				if (label) { return label; }
			}
			return '';
		}
		var style = pick(['Door Design', 'Door Style']);
		var colour = pick(['Door Colour (External)', 'Door Colour']);
		if (!style) { return 'My door'; }
		return (colour ? style + ' in ' + colour : style).slice(0, 80);
	}

	// The POST body for /enquiry from the form's values.
	function buildData(values, design, pageUrl) {
		return {
			designName: String(values.designName || '').trim(),
			name: values.name,
			email: values.email,
			postcode: values.postcode,
			telephone: values.telephone || '',
			hd_hp: values.hd_hp || '',
			design: cleanDesign(design || {}),
			// The designer's own page (no query) — the server validates it's same-origin and
			// builds the "open my design" email link from it.
			pageUrl: pageUrl
		};
	}
```

Change the module's final `return` to:

```js
	return { create: create, snapshot: snapshot, cleanDesign: cleanDesign, FIELDS: FIELDS, defaultDesignName: defaultDesignName, buildData: buildData };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/js/enquiry-form.test.js`
Expected: `enquiry-form.test.js: all assertions passed`

- [ ] **Step 5: Rework the form itself**

Still in `assets/js/enquiry.js`, inside `create(o)`:

Add one variable to the declarations at the top of `create`:

```js
		var nameTouched = false; // has the customer typed their own design name?
```

Replace `renderForm` with:

```js
		function renderForm(container) {
			container.innerHTML = '';
			container.appendChild(el('div', 'hd-dd__steptitle', I18N.formTitle || 'Where shall we send your link and price?'));
			if (!formEl) { formEl = buildForm(); }
			// Keep the suggested name in step with the door until the customer types their own.
			if (!nameTouched) { formEl.elements['designName'].value = defaultDesignName(cleanDesign(o.getDesign())); }
			container.appendChild(formEl);
		}
```

Replace the field loop at the top of `buildForm` (from `[` … `].forEach(function (fld) {` to its closing `});`) with:

```js
			FIELDS.forEach(function (fld) {
				var row = el('label', 'hd-dd__form-row');
				row.appendChild(el('span', 'hd-dd__form-label', fld.label));
				var input = document.createElement('input');
				input.className = 'hd-dd__form-input';
				input.type = fld.type;
				input.name = fld.name;
				input.required = fld.required;
				if (fld.maxLength) { input.maxLength = fld.maxLength; }
				input.setAttribute('autocomplete', fld.autocomplete);
				if (fld.name === 'designName') {
					input.addEventListener('input', function () { nameTouched = true; });
				} else if (lastContact && lastContact[fld.name] != null) {
					// Pre-fill from the previous save so "Design another door" is quick.
					input.value = lastContact[fld.name];
				}
				row.appendChild(input);
				var err = el('span', 'hd-dd__form-error');
				err.setAttribute('data-error-for', fld.name);
				row.appendChild(err);
				form.appendChild(row);
			});
```

Delete the consent block (from `var consent = el('label', 'hd-dd__consent');` through `form.appendChild(consent);`).

Replace the submit button and trust line (from `var submitBtn = el('button', 'hd-dd__submit', …` through the `form.appendChild(el('div', 'hd-dd__form-trust', …));` statement) with:

```js
			var submitBtn = el('button', 'hd-dd__submit', I18N.submit || 'Save my design & get my price');
			submitBtn.type = 'submit';
			form.appendChild(submitBtn);
			// In place of a consent tick: saving is asking us for a price.
			form.appendChild(el('div', 'hd-dd__form-consentline',
				I18N.consentLine || 'By saving you’re asking us for a price. We’ll use your details to send it and may get in touch about your door.'));
			form.appendChild(el('div', 'hd-dd__form-trust',
				I18N.trust || 'No spam, ever — your details are only used to prepare your price.'));
```

In `submit`, replace the `var data = { … };` statement with:

```js
			var data = buildData({
				designName: f['designName'].value,
				name: f['name'].value,
				email: f['email'].value,
				postcode: f['postcode'].value,
				telephone: f['telephone'].value,
				hd_hp: f['hd_hp'].value
			}, o.getDesign(), window.location.origin + window.location.pathname);
```

In `renderSuccess`, replace the title, text and link label:

```js
			wrap.appendChild(el('div', 'hd-dd__thanks-title', 'Saved — and your price is on its way.'));
			wrap.appendChild(el('div', 'hd-dd__thanks-text',
				'We’ve emailed you a link to come back to this design. We’ll work out a price for this exact door and send it to you, usually within one working day.'));
```

and change `el('a', 'hd-dd__thanks-link', 'Revisit this design')` to `el('a', 'hd-dd__thanks-link', 'Open this design')`. Change the note `'Quoting for more than one door? Design the next one now — we already have your details.'` to `'More than one door? Design the next one now — we already have your details.'`. Leave the guide-price paragraph and the "Design another door" button as they are.

Replace `reset` with:

```js
		// "Design another door": rebuild the form next time so it pre-fills from lastContact
		// and suggests a name for the new door.
		function reset() { formEl = null; nameTouched = false; }
```

- [ ] **Step 6: Update the translatable strings**

In `includes/class-hd-assets.php`, `i18n_strings()`:

- Change `'formTitle'` to `__( 'Where shall we send your link and price?', 'hd-door-designer' )`.
- Delete the `'reassure'` line.
- Change `'submit'` to `__( 'Save my design & get my price', 'hd-door-designer' )`.
- Change `'trust'` to `__( 'No spam, ever — your details are only used to prepare your price.', 'hd-door-designer' )`.
- Delete the `'consent'` line and add in its place:

```php
			'consentLine'  => __( 'By saving you’re asking us for a price. We’ll use your details to send it and may get in touch about your door.', 'hd-door-designer' ),
```

- Change `'intro'` to `__( 'Design your door, save it and get a price — it takes about two minutes.', 'hd-door-designer' )`.

- [ ] **Step 7: Run all tests**

Run: `node tests/js/enquiry-form.test.js && node tests/js/trust.test.js && node tests/js/funnel.test.js && node tests/js/api-client.test.js && php -l includes/class-hd-assets.php && php tests/php/run.php`
Expected: each JS test prints `all assertions passed`; `No syntax errors detected`; `all PHP tests passed`.

- [ ] **Step 8: Commit**

```bash
git add assets/js/enquiry.js includes/class-hd-assets.php tests/js/enquiry-form.test.js
git commit -m "feat(form): save form — design name, phone optional, a plain line instead of the consent tick"
```

---

### Task 6: Review step in both flows, plus the copy-rule test

**Files:**
- Modify: `assets/js/wizard/review.js:38-46`
- Modify: `assets/js/hd-door-designer.js:421` (render), `:547-556` (`reviewCtx`), `:752` (`renderForm`)
- Modify: `assets/js/swipe/swipe-view.js:254-260` (`review`), `:274-275` and `:283-288` (`v.render`)
- Modify: `assets/js/swipe/swipe-app.js:223-232` (`go`)
- Modify: `includes/class-hd-assets.php:71-91` and `:105-111` (script registration)
- Modify: `tools/preview-test.html`, `tools/swipe-test.html`, `tools/boot-test.html`
- Create: `tests/js/copy-rule.test.js`
- Modify: `README.md` (Tests list)

**Interfaces:**
- Consumes: `HD_DD_Trust.render(container, trust)` and `HD_DD_Trust.COPY.cta` (Task 4); `enquiry.renderForm(container)` (Task 5); `HD_DD_CONFIG.trust` (Task 1).
- Produces: `HD_DD_Review.render(container, ctx)` reads three new optional `ctx` keys: `renderTrust(container)` (function), `showCta` (boolean, default true), `ctaLabel` (string).

- [ ] **Step 1: Write the failing copy-rule test**

Create `tests/js/copy-rule.test.js`:

```js
// Copy rule: nothing the customer reads may promise that we won't phone, and the Review
// step's wording is the agreed wording. `node tests/js/copy-rule.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..', '..');
function files(dir, ext) {
  var out = [];
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(function (e) {
    var rel = dir + '/' + e.name;
    if (e.isDirectory()) { out = out.concat(files(rel, ext)); }
    else if (e.name.slice(-ext.length) === ext) { out.push(rel); }
  });
  return out;
}

var BANNED = [
  /\bno\s+(sales\s+|cold\s+)?calls?\b/i,
  /\b(won[’']?t|will not|never|don[’']?t)\s+(call|phone|ring)\b/i,
  /\bonly\s+(call|phone|ring)\s+(you|if)\b/i
];
var sources = files('assets/js', '.js').concat(files('includes', '.php'));
assert.ok(sources.length > 20, 'found the source files');
sources.forEach(function (rel) {
  fs.readFileSync(path.join(root, rel), 'utf8').split('\n').forEach(function (line, i) {
    BANNED.forEach(function (re) {
      assert.ok(!re.test(line), rel + ':' + (i + 1) + ' promises not to call: ' + line.trim());
    });
  });
});

// The agreed wording is in place, and the old quote wording is gone from the Review step.
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
var review = read('assets/js/wizard/review.js');
var swipe = read('assets/js/swipe/swipe-view.js');
var enquiry = read('assets/js/enquiry.js');
[review, swipe].forEach(function (src) {
  assert.ok(src.indexOf('Get my free quote') === -1, 'old CTA removed');
  assert.ok(src.indexOf('HD_DD_Trust') !== -1, 'Review step draws the trust block');
});
assert.ok(enquiry.indexOf('By saving you’re asking us for a price. We’ll use your details to send it and may get in touch about your door.') !== -1, 'consent line verbatim');
assert.ok(enquiry.indexOf("'consent'") === -1 && enquiry.indexOf('hd-dd__consent') === -1, 'no consent tick left in the form');
assert.strictEqual(require('../../assets/js/trust.js').COPY.benefits[2], 'No pressure and no obligation. You decide what happens next.');

console.log('copy-rule.test.js: all assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/js/copy-rule.test.js`
Expected: FAIL — `AssertionError: old CTA removed`.

- [ ] **Step 3: Classic flow — `review.js`**

In `assets/js/wizard/review.js`, replace everything from `container.appendChild(el('div', 'hd-dd__review-note',` down to and including `container.appendChild(cta);` with:

```js
    container.appendChild(el('div', 'hd-dd__disclaimer',
      'We make every effort to show your door as accurately as possible, but this preview is an impression — it should not be taken as a perfect representation of the finished product.'));

    // Social proof + what saving gets you (HD_DD_Trust, supplied by the app).
    if (ctx.renderTrust) { ctx.renderTrust(container); }

    // Hidden once the save form is open beneath the list.
    if (ctx.showCta !== false) {
      var cta = el('button', 'hd-dd__cta', ctx.ctaLabel || 'Save my design & get my price'); cta.type = 'button';
      cta.addEventListener('click', ctx.onSubmitClick);
      container.appendChild(cta);
    }
```

- [ ] **Step 4: Classic flow — `hd-door-designer.js`**

At line 421, replace

```js
			if (this._atForm) { this.renderForm(); } else { HD_DD_Review.render(this.body, this.reviewCtx(st)); }
```

with

```js
			// The save form opens IN PLACE under the review list (no separate screen), so the
			// door, the spec and the reassurance all stay in view while the details are typed.
			HD_DD_Review.render(this.body, this.reviewCtx(st));
			if (this._atForm) { this.renderForm(); }
```

In `reviewCtx`, replace the `onSubmitClick` line with:

```js
			showCta: !this._atForm,
			ctaLabel: window.HD_DD_Trust ? window.HD_DD_Trust.COPY.cta : null,
			renderTrust: function (c) { if (window.HD_DD_Trust) { window.HD_DD_Trust.render(c, CFG.trust); } },
			onSubmitClick: function () { self._atForm = true; self._scrollToForm = true; self.render(); }
```

Replace `App.prototype.renderForm` with:

```js
	App.prototype.renderForm = function () {
		var box = document.createElement('div');
		box.className = 'hd-dd__savebox';
		this.body.appendChild(box);
		this.enquiryCtl().renderForm(box);
		// Only on the tap that opened it — not on later re-renders while the form is open.
		if (this._scrollToForm) {
			this._scrollToForm = false;
			try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* older browsers */ }
		}
	};
```

Leave `trackView` alone: the `form` view still reports the `details` funnel step.

- [ ] **Step 5: Swipe flow — `swipe-view.js` and `swipe-app.js`**

In `assets/js/swipe/swipe-view.js`, replace the `review` function with:

```js
		// The review list, the trust block, and — once "Save my design" is tapped — the save
		// form opened in place beneath them. Returns the form's box (or null) for scrolling.
		function review(formOpen) {
			heading('Your door', 'Here’s your design. Tap Edit to change anything.');
			body.appendChild(P.reviewList(reviewRows(), function (key) { app.go(key); }));
			body.appendChild(el('div', 'hd-dd__disclaimer', 'We make every effort to show your door accurately, but this preview is an impression, not a perfect representation of the finished product.'));
			window.HD_DD_Trust.render(body, CFG.trust);
			if (!formOpen) {
				setCta(window.HD_DD_Trust.COPY.cta + ' →', function () { app.go('form'); });
				return null;
			}
			var box = el('div', 'hd-dd__savebox');
			body.appendChild(box);
			enquiryCtl().renderForm(box);
			setCta(null);
			return box;
		}
```

In `v.render`, add `var formBox = null;` directly below `var scr = app.screen;`, and replace the two lines

```js
			else if (scr === 'review') { paintStage(); review(); }
			else if (scr === 'form') { paintStage(); enquiryCtl().renderForm(body); setCta(null); }
```

with

```js
			else if (scr === 'review') { paintStage(); review(false); }
			else if (scr === 'form') { paintStage(); formBox = review(true); }
```

Inside the `if (!quiet) { … }` block at the end of `v.render`, add as its last statement:

```js
				if (formBox) { try { formBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* older browsers */ } }
```

In `assets/js/swipe/swipe-app.js`, `SwipeApp.prototype.go`, replace

```js
		try { this.root.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* older browsers */ }
```

with

```js
		// Opening the save form scrolls to the form itself (see the view), not back to the top.
		if (key !== 'form') {
			try { this.root.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* older browsers */ }
		}
```

The `funnel.step('details')` line in `go` stays as it is.

- [ ] **Step 6: Register `trust.js`**

In `includes/class-hd-assets.php`, directly below the `-enquiry` registration line, add:

```php
		// Review-step social proof + benefits block, used by both flows.
		wp_register_script( self::HANDLE . '-trust', HD_DD_URL . 'assets/js/trust.js', array(), $ver_js, true );
```

Add `self::HANDLE . '-trust',` to the classic script's dependency array (after `self::HANDLE . '-enquiry',`) and to the `-swipeview` dependency array (after `self::HANDLE . '-enquiry'`).

- [ ] **Step 7: Update the QA harnesses**

In each of `tools/preview-test.html`, `tools/swipe-test.html` and `tools/boot-test.html`, add directly above the `<script src="../assets/js/enquiry.js"></script>` line:

```html
<script src="../assets/js/trust.js"></script>
```

Give each harness a sample `trust` config (clearly not a real review):

- `tools/preview-test.html` line 68 — add to the `HD_DD_CONFIG` object: `, trust: { rating: '4.9', count: '321', url: '', quotes: [{ text: 'Harness sample quote, not a real review.', by: 'Sample, Harness' }] }`
- `tools/swipe-test.html` line 48 — change to: `window.HD_DD_CONFIG = { version: 'harness', trust: { rating: '4.9', count: '321', url: '', quotes: [{ text: 'Harness sample quote, not a real review.', by: 'Sample, Harness' }] } };`
- `tools/boot-test.html` — in the `HD_DD_CONFIG` object, add above `i18n: {}`: `trust: { rating: '4.9', count: '321', url: '', quotes: [{ text: 'Harness sample quote, not a real review.', by: 'Sample, Harness' }] },`

- [ ] **Step 8: Run the tests**

Run: `node tests/js/copy-rule.test.js`
Expected: `copy-rule.test.js: all assertions passed`

Run every JS test and the PHP suite:

```bash
for f in tests/js/*.test.js tools/tests/test-*.js; do node "$f" || echo "FAILED: $f"; done
php tests/php/run.php
php -l includes/class-hd-assets.php
```

Expected: no `FAILED:` lines; `all PHP tests passed`; `No syntax errors detected`.

- [ ] **Step 9: Check both flows by eye in the harness**

Serve the plugin folder (`php -S localhost:8765` from the plugin root) and open `http://localhost:8765/tools/preview-test.html` (classic) and `http://localhost:8765/tools/swipe-test.html` (swipe), each at 390px wide and at desktop width. Design a door through to Review and confirm, in **both** flows:

1. Under the review list: disclaimer, "★ 4.9 on Checkatrade · 321 reviews", the sample quote, "Save this design and get your price", three benefit lines, then the button "Save my design & get my price".
2. Tapping the button keeps the review list and trust block on screen, opens the form beneath them, scrolls to it and hides the button. The door preview is still visible.
3. The form shows, in order: Name this design (pre-filled, e.g. "Ketu in Anthracite Grey"), Your name, Email, Post code, Phone (optional); then the save button, the consent line and the "No spam" line. There is no tick box.
4. Back returns to Review with the form closed. Editing the colour and reopening the form updates the suggested design name; typing a name of your own and then editing the door keeps your name.
5. Submitting shows "Preview mode — enquiry not sent." (the harness has no REST endpoint).
6. Nothing is clipped or double-indented at 390px. If the trust block or form sits further in than the review list in the swipe flow, add a scoped override in `assets/css/hd-swipe.css` (for example `.hd-sw .hd-dd__trust { margin-left: 0; margin-right: 0; }`) and re-check.

Then open `http://localhost:8765/tools/boot-test.html`, complete a save in each arm and confirm in the console that `window.__analytics` contains, in order, a `review` step, a `details` step (recorded when the form opened) and one `lead`, and that the logged `enquiry` request body in `window.__rest` has `designName`, has no `consent` key, and has `telephone: ""` when the phone was left empty.

- [ ] **Step 10: Add the new tests to the README and commit**

In `README.md`, in the Tests code block, add after the `design-shared.test.js` line:

```
node tests/js/trust.test.js           # Review-step rating / quote / benefits block
node tests/js/enquiry-form.test.js    # save form: fields, default design name, POST body
node tests/js/copy-rule.test.js       # no customer-facing text promises we won't phone
```

and change the `php tests/php/run.php` comment to:

```
php tests/php/run.php                 # saving (optional phone, design name), emails, review settings, honeypot, failure log, nonce, admin labels, experiments
```

```bash
git add assets/js/wizard/review.js assets/js/hd-door-designer.js assets/js/swipe/swipe-view.js assets/js/swipe/swipe-app.js assets/css includes/class-hd-assets.php tools/preview-test.html tools/swipe-test.html tools/boot-test.html tests/js/copy-rule.test.js README.md
git commit -m "feat(review): save form opens in place on Review in both flows, with social proof and reassurance"
```

---

### Task 7: Docs, quote-workflow check, version and release

**Files:**
- Modify: `README.md` (Privacy / GDPR section; a short "Review step" settings note)
- Modify: `hd-door-designer.php:6` and `:24` (version)
- Modify: `docs/superpowers/specs/2026-10-01-save-design-and-price-design.md` (status line)

**Interfaces:**
- Consumes: everything above.
- Produces: plugin version `0.3.0`.

- [ ] **Step 1: Check the quote workflow tolerates the new payload**

The quote workflow reads the JSON block in the notification email. Find its instructions:

```bash
grep -ril "quote-from-request\|structured payload\|suggestedLock" "C:/Users/Danny/Work/_platform" "C:/Users/Danny/.claude/skills" 2>/dev/null | head
```

Read each file found and confirm two things: it does not require `customer.telephone` to be non-empty, and it does not reject unknown top-level keys (`designName`). If either fails, **stop and tell Daniel** what the workflow assumes — do not edit the skill and do not release.

- [ ] **Step 2: Update the README**

In `README.md`, Privacy / GDPR section, replace

```
- A consent checkbox is required on the form.
```

with

```
- There is no consent tick. The save form states, under the button, that saving asks us
  for a price and that we will use the details to send it and may get in touch. Phone is
  optional. Customer-facing copy must never promise that we won't phone
  (`tests/js/copy-rule.test.js` enforces this).
```

Directly above the `## Tests` heading, add:

```
## Review step: save your design and get a price

The Review step ends with "Save my design & get my price". A save is an enquiry: it is
stored, emailed to the recipients and counted as a lead, and the customer is emailed a
link back to the design. Required: a name for the design, name, email, postcode.

**Door Enquiries → Settings → Review step** holds the Checkatrade rating, review count,
profile link and customer quotes (one per line: `Quote text | Name, Town`). Leave the
rating or count empty to hide the rating line; with no quotes, no quote is shown.

Files: `includes/class-hd-trust-settings.php`, `assets/js/trust.js`, `assets/js/enquiry.js`.
Design: `docs/superpowers/specs/2026-10-01-save-design-and-price-design.md`.
```

- [ ] **Step 3: Bump the version**

In `hd-door-designer.php`, change ` * Version:           0.2.64` to ` * Version:           0.3.0` and `define( 'HD_DD_VERSION', '0.2.64' );` to `define( 'HD_DD_VERSION', '0.3.0' );`.

In the spec, change the Status line to:

```
**Status:** Release 1 implemented on `feat/save-design-and-price` (v0.3.0); Releases 2 and 3 not started
```

- [ ] **Step 4: Full test run**

```bash
for f in tests/js/*.test.js tools/tests/test-*.js; do node "$f" || echo "FAILED: $f"; done
php tests/php/run.php
php tools/tests/test-image-proxy.php
```

Expected: no `FAILED:` lines; `all PHP tests passed`; the image-proxy test passes.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-01-save-design-and-price-design.md
git commit -m "docs: the Review step's save form and its settings"
git add hd-door-designer.php
git commit -m "chore(release): v0.3.0"
```

- [ ] **Step 6: Hand over to Daniel before anything leaves the machine**

Stop here and report. The remaining steps need Daniel:

1. **Before release:** confirm the Checkatrade rating and review count are correct, and supply two or three real customer quotes with names and towns. Record the current review → lead rate for the live version from the manager's version cohorts, so there is a baseline.
2. **Release (on his go-ahead):** merge `feat/save-design-and-price` to `main`, `git tag v0.3.0`, push the branch and the tag, create the GitHub release, then update the plugin in wp-admin.
3. **On the live site:** enter the rating, link and quotes under Door Enquiries → Settings → Review step.
4. **Live check with `?notrack=1`**, in both flows (`?flow=classic`, `?flow=swipe`), on a phone and on desktop: save a design named "TEST (please delete)" with no phone number. Confirm the thank-you screen, the customer email (subject, "Open my design" button reopening the door on Review), the notification email ("(not given)" phone, design name, JSON with `designName`), and the design name in the wp-admin list and detail. Delete the test rows afterwards.

---

## Self-review notes

- **Spec coverage (Release 1):** Review layout and in-place form → Task 6. Form fields, consent line, button → Task 5. Copy rule → Tasks 3 and 6 (tests) and Global Constraints. Thank-you screen → Task 5. Social proof and settings → Tasks 1 and 4. Server changes (`telephone`/`consent` optional, `designName`, `DB_VERSION` 3, payload) → Task 2. Owner and customer emails, wp-admin list and detail → Task 3. Quote-workflow risk → Task 7 Step 1. Funnel unchanged → Task 6 Steps 4, 5 and 9. Old cached script → Task 2 test 5. Rollout → Task 7 Step 6.
- **Not in this plan, by design:** access keys, My designs, unlock codes, save changes, estimates (Releases 2 and 3).
