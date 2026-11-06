<?php
/**
 * wp-admin → Door Enquiries → Follow-up emails: how many savers are in the follow-up sequence
 * and who, who finished it, who dropped out (and why), and recent saves that never started one.
 * The grouping is HD_DD_Follow_Up_Board; this class runs the queries and prints the tables.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Follow_Up_Page {

	const PAGE = 'hd-dd-follow-ups';
	const CAP  = 'manage_options';
	const DAYS = 30; // how far back to list saves with no follow-up.

	public function register() {
		add_action( 'admin_menu', array( $this, 'menu' ), 20 ); // after the parent menu exists.
	}

	public function menu() {
		add_submenu_page(
			HD_DD_Admin::MENU_SLUG,
			__( 'Follow-up emails', 'hd-door-designer' ),
			__( 'Follow-up emails', 'hd-door-designer' ),
			self::CAP,
			self::PAGE,
			array( $this, 'render' )
		);
	}

	public static function url() {
		return admin_url( 'admin.php?page=' . self::PAGE );
	}

	/** Everything the board needs, straight from the database. */
	public static function load() {
		global $wpdb;
		$ft      = HD_DD_Follow_Up::table();
		$et      = HD_DD_Repository::table();
		$lt      = HD_DD_Follow_Up_Log::table();
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table names only.
		$follows = (array) $wpdb->get_results( "SELECT f.*, e.customer_email, e.customer_name, e.design_name, e.reference, e.created_at AS saved_at, (SELECT COUNT(*) FROM {$lt} ev WHERE ev.enquiry_id = f.enquiry_id AND ev.type = 'click') AS clicks FROM {$ft} f LEFT JOIN {$et} e ON e.id = f.enquiry_id ORDER BY f.started_at DESC" );
		$saves   = (array) $wpdb->get_results( "SELECT id, reference, created_at, customer_email, customer_name, design_name, status, kind FROM {$et} WHERE kind = 'save'" );
		$leads   = (array) $wpdb->get_col( "SELECT DISTINCT customer_email FROM {$et} WHERE kind IN ('enquiry','callback')" );
		// phpcs:enable
		$since = wp_date( 'Y-m-d H:i:s', time() - self::DAYS * DAY_IN_SECONDS );
		return HD_DD_Follow_Up_Board::build( $follows, $saves, $leads, $since );
	}

	public function render() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$board = self::load();
		$c     = HD_DD_Follow_Up_Board::counts( $board );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Follow-up emails to savers', 'hd-door-designer' ); ?></h1>
			<p class="description" style="max-width:820px;">
				<?php esc_html_e( 'Someone who saves a design and does not ask for a price gets three emails from Daniel, about 1, 2 and 4 days after saving (sent 8am to 8pm). The emails are checked hourly. Opens and replies cannot be seen here; if someone replies, open their design and press "Stop follow-ups".', 'hd-door-designer' ); ?>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=' . HD_DD_Admin::SETTINGS_SLUG ) ); ?>"><?php esc_html_e( 'Per-email results are in Settings.', 'hd-door-designer' ); ?></a>
			</p>
			<?php self::render_summary( $c ); ?>
			<?php self::render_running( $board['running'] ); ?>
			<?php self::render_finished( $board['finished'] ); ?>
			<?php self::render_stopped( $board['stopped'] ); ?>
			<?php self::render_not_started( $board['not_started'] ); ?>
		</div>
		<?php
	}

	private static function render_summary( $c ) {
		$tiles = array();
		foreach ( self::step_labels() as $n => $l ) {
			$tiles[] = array( $l[0], $c['waiting'][ $n ], $l[1] );
		}
		$tiles = array_merge(
			$tiles,
			array(
			array( __( 'Finished all three', 'hd-door-designer' ), $c['finished'], __( 'Got every email, no action yet', 'hd-door-designer' ) ),
			array( __( 'Dropped out', 'hd-door-designer' ), $c['stopped'], self::reasons_line( $c['reasons'] ) ),
			array( sprintf( /* translators: %d: days */ __( 'Saves with no follow-up (last %d days)', 'hd-door-designer' ), self::DAYS ), $c['not_started'], __( 'Reasons in the table below', 'hd-door-designer' ) ),
			)
		);
		?>
		<div style="display:flex;flex-wrap:wrap;gap:12px;margin:16px 0 8px;">
			<?php foreach ( $tiles as $t ) : ?>
				<div style="background:#fff;border:1px solid #c3c4c7;border-radius:4px;padding:12px 16px;min-width:200px;flex:1 1 200px;max-width:300px;">
					<div style="color:#50575e;"><?php echo esc_html( $t[0] ); ?></div>
					<div style="font-size:28px;font-weight:600;line-height:1.3;"><?php echo (int) $t[1]; ?></div>
					<div style="color:#50575e;font-size:12px;"><?php echo esc_html( $t[2] ); ?></div>
				</div>
			<?php endforeach; ?>
		</div>
		<?php
	}

	private static function reasons_line( $reasons ) {
		$parts = array();
		foreach ( $reasons as $k => $n ) {
			$parts[] = self::reason( $k ) . ': ' . $n;
		}
		return $parts ? implode( ' · ', $parts ) : __( 'Nobody yet', 'hd-door-designer' );
	}

	/** Step => [tile/heading label, short note]: who is waiting for which email. */
	private static function step_labels() {
		return array(
			1 => array( __( 'Scheduled for email 1', 'hd-door-designer' ), __( 'Saved; first follow-up about a day later', 'hd-door-designer' ) ),
			2 => array( __( 'Had email 1, waiting for email 2', 'hd-door-designer' ), __( 'About two days after saving', 'hd-door-designer' ) ),
			3 => array( __( 'Had email 2, waiting for email 3', 'hd-door-designer' ), __( 'The last one, about four days after saving', 'hd-door-designer' ) ),
		);
	}

	/** One table per step, soonest due first. */
	private static function render_running( $running ) {
		foreach ( self::step_labels() as $n => $l ) {
			$rows = $running[ $n ];
			$due  = array();
			foreach ( $rows as $f ) {
				$due[ (int) $f->enquiry_id ] = HD_DD_Follow_Up_Plan::next_due( strtotime( $f->started_at . ' UTC' ), (int) $f->sent_steps, $f->last_sent_at ? strtotime( $f->last_sent_at . ' UTC' ) : null );
			}
			usort(
				$rows,
				function ( $a, $b ) use ( $due ) {
					return (int) $due[ (int) $a->enquiry_id ] - (int) $due[ (int) $b->enquiry_id ];
				}
			);
			self::heading( $l[0], count( $rows ) );
			self::table(
				array( __( 'Who', 'hd-door-designer' ), __( 'Design', 'hd-door-designer' ), __( 'Saved', 'hd-door-designer' ), __( 'Last email', 'hd-door-designer' ), sprintf( /* translators: %d: email number */ __( 'Email %d due', 'hd-door-designer' ), $n ), __( 'Clicks', 'hd-door-designer' ) ),
				array_map(
					function ( $f ) use ( $due ) {
						$d = $due[ (int) $f->enquiry_id ];
						$next = $d && $d > time() ? wp_date( 'D j M, H:i', $d ) : __( 'Due now (next hourly check, 8am–8pm)', 'hd-door-designer' );
						return array( self::who( $f ), self::design( $f ), self::local( $f->saved_at ), self::utc( $f->last_sent_at ), esc_html( $next ), (int) $f->clicks );
					},
					$rows
				),
				__( 'Nobody at this step.', 'hd-door-designer' )
			);
		}
	}

	private static function render_finished( $rows ) {
		self::heading( __( 'Finished the sequence', 'hd-door-designer' ), count( $rows ) );
		self::table(
			array( __( 'Who', 'hd-door-designer' ), __( 'Design', 'hd-door-designer' ), __( 'Started', 'hd-door-designer' ), __( 'Last email', 'hd-door-designer' ), __( 'Clicks', 'hd-door-designer' ) ),
			array_map(
				function ( $f ) {
					return array( self::who( $f ), self::design( $f ), self::utc( $f->started_at ), self::utc( $f->last_sent_at ), (int) $f->clicks );
				},
				$rows
			),
			__( 'Nobody has had all three emails yet.', 'hd-door-designer' )
		);
	}

	private static function render_stopped( $rows ) {
		self::heading( __( 'Dropped out', 'hd-door-designer' ), count( $rows ) );
		self::table(
			array( __( 'Who', 'hd-door-designer' ), __( 'Design', 'hd-door-designer' ), __( 'Why', 'hd-door-designer' ), __( 'Emails sent', 'hd-door-designer' ), __( 'When', 'hd-door-designer' ), __( 'Clicks', 'hd-door-designer' ) ),
			array_map(
				function ( $f ) {
					return array( self::who( $f ), self::design( $f ), esc_html( self::reason( $f->stop_reason ) ), esc_html( (int) $f->sent_steps . ' of ' . HD_DD_Follow_Up_Plan::STEPS ), self::utc( $f->stopped_at ), (int) $f->clicks );
				},
				$rows
			),
			__( 'Nobody has dropped out yet.', 'hd-door-designer' )
		);
	}

	private static function render_not_started( $rows ) {
		/* translators: %d: days */
		self::heading( sprintf( __( 'Saves in the last %d days with no follow-up', 'hd-door-designer' ), self::DAYS ), count( $rows ) );
		self::table(
			array( __( 'Saved', 'hd-door-designer' ), __( 'Who', 'hd-door-designer' ), __( 'Design', 'hd-door-designer' ), __( 'Why not', 'hd-door-designer' ) ),
			array_map(
				function ( $s ) {
					$s->enquiry_id = $s->id;
					return array( self::local( $s->created_at ), self::who( $s ), self::design( $s ), esc_html( HD_DD_Follow_Up_Board::NOT_STARTED[ $s->why ] ) );
				},
				$rows
			),
			__( 'Every recent save is being followed up.', 'hd-door-designer' )
		);
	}

	// -------------------------------------------------------------------
	// Small helpers (each returns escaped HTML)
	// -------------------------------------------------------------------
	private static function heading( $text, $n ) {
		echo '<h2 style="margin-top:28px;">' . esc_html( $text ) . ' <span style="color:#50575e;font-weight:400;">(' . (int) $n . ')</span></h2>';
	}

	private static function table( $head, $rows, $empty ) {
		if ( ! $rows ) {
			echo '<p>' . esc_html( $empty ) . '</p>';
			return;
		}
		echo '<table class="widefat striped" style="max-width:1100px;"><thead><tr>';
		foreach ( $head as $h ) {
			echo '<th>' . esc_html( $h ) . '</th>';
		}
		echo '</tr></thead><tbody>';
		foreach ( $rows as $r ) {
			echo '<tr><td>' . implode( '</td><td>', $r ) . '</td></tr>'; // phpcs:ignore WordPress.Security.EscapeOutput -- cells are escaped by the helpers above.
		}
		echo '</tbody></table>';
	}

	private static function who( $r ) {
		$name = trim( (string) $r->customer_name );
		return ( '' !== $name ? '<strong>' . esc_html( $name ) . '</strong><br>' : '' ) . esc_html( (string) $r->customer_email );
	}

	private static function design( $r ) {
		$label = trim( (string) $r->reference . ' ' . (string) $r->design_name );
		$url   = admin_url( 'admin.php?page=' . HD_DD_Admin::MENU_SLUG . '&enquiry=' . (int) $r->enquiry_id );
		return '<a href="' . esc_url( $url ) . '">' . esc_html( '' !== $label ? $label : '#' . (int) $r->enquiry_id ) . '</a>';
	}

	private static function utc( $mysql ) {
		return $mysql ? esc_html( wp_date( 'j M Y, H:i', strtotime( $mysql . ' UTC' ) ) ) : '—';
	}

	/** A stored local (UK) time, e.g. the save's created_at. */
	private static function local( $mysql ) {
		return $mysql ? esc_html( mysql2date( 'j M Y, H:i', $mysql ) ) : '—';
	}

	private static function reason( $key ) {
		return isset( HD_DD_Follow_Up::REASONS[ $key ] ) ? HD_DD_Follow_Up::REASONS[ $key ] : (string) $key;
	}
}
