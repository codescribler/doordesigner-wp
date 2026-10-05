<?php
/**
 * wp-admin → Door Enquiries → Experiments: the live A/B test's numbers (computed on
 * view, never waiting for cron), its actions (Make X the default / Stop test), the
 * Start a new test form, and the history of finished tests.
 *
 * Every action is a nonce-checked admin-post form restricted to manage_options.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Experiments_Admin {

	const PAGE   = 'hd-dd-experiments';
	const CAP    = 'manage_options';
	const ACTION = 'hd_dd_experiment';

	public function register() {
		add_action( 'admin_menu', array( $this, 'menu' ), 20 ); // after the parent menu exists.
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle' ) );
	}

	public function menu() {
		add_submenu_page(
			HD_DD_Admin::MENU_SLUG,
			__( 'Experiments', 'hd-door-designer' ),
			__( 'Experiments', 'hd-door-designer' ),
			self::CAP,
			self::PAGE,
			array( $this, 'render' )
		);
	}

	// -------------------------------------------------------------------
	// Actions
	// -------------------------------------------------------------------
	/** admin-post handler: check, apply, redirect back with a result code. */
	public function handle() {
		if ( ! current_user_can( self::CAP ) || ! check_admin_referer( self::ACTION ) ) {
			wp_die( esc_html__( 'Not allowed.', 'hd-door-designer' ) );
		}
		$result = self::apply( wp_unslash( $_POST ) );
		$code   = is_wp_error( $result ) ? $result->get_error_code() : $result;
		wp_safe_redirect( add_query_arg( 'hd_dd_exp', rawurlencode( $code ), admin_url( 'admin.php?page=' . self::PAGE ) ) );
		exit;
	}

	/**
	 * Apply one posted action. Separate from handle() so it can be tested.
	 *
	 * @param array $post The (unslashed) form fields: do, flow, control, challenger, percent.
	 * @return string|WP_Error Result code for the notice.
	 */
	public static function apply( array $post ) {
		$do = isset( $post['do'] ) ? sanitize_key( $post['do'] ) : '';
		if ( 'make_default' === $do ) {
			$r = HD_DD_Experiments::make_default( isset( $post['flow'] ) ? sanitize_key( $post['flow'] ) : '' );
			return is_wp_error( $r ) ? $r : 'made_default';
		}
		if ( 'stop' === $do ) {
			return HD_DD_Experiments::end( 'stopped' ) ? 'stopped' : new WP_Error( 'hd_dd_exp_none', '' );
		}
		if ( 'set_percent' === $do ) {
			$r = HD_DD_Experiments::set_percent( isset( $post['percent'] ) ? (int) $post['percent'] : 0 );
			return is_wp_error( $r ) ? $r : 'split_changed';
		}
		if ( 'start' === $do ) {
			$r = HD_DD_Experiments::start(
				isset( $post['control'] ) ? sanitize_key( $post['control'] ) : '',
				isset( $post['challenger'] ) ? sanitize_key( $post['challenger'] ) : '',
				isset( $post['percent'] ) ? (int) $post['percent'] : 50
			);
			return is_wp_error( $r ) ? $r : 'started';
		}
		return new WP_Error( 'hd_dd_exp_unknown', '' );
	}

	/** Result code → notice. */
	private static function notice( $code ) {
		$map = array(
			'started'           => array( 'success', __( 'Test started. New visitors are now split between the two flows.', 'hd-door-designer' ) ),
			'stopped'           => array( 'success', __( 'Test stopped. The default flow is unchanged.', 'hd-door-designer' ) ),
			'made_default'      => array( 'success', __( 'Done — that flow is now the default for every visitor, and the test has ended.', 'hd-door-designer' ) ),
			'split_changed'     => array( 'success', __( 'Split updated. It applies to new visitors; anyone already in the test keeps their flow.', 'hd-door-designer' ) ),
			'hd_dd_exp_same'    => array( 'error', __( 'That is already the split.', 'hd-door-designer' ) ),
			'hd_dd_exp_running' => array( 'error', __( 'A test is already running. Stop it first.', 'hd-door-designer' ) ),
			'hd_dd_exp_flows'   => array( 'error', __( 'Pick two different flows.', 'hd-door-designer' ) ),
			'hd_dd_exp_percent' => array( 'error', __( 'The split must be between 1 and 99%.', 'hd-door-designer' ) ),
			'hd_dd_exp_flow'    => array( 'error', __( 'That flow is not part of the current test.', 'hd-door-designer' ) ),
		);
		return isset( $map[ $code ] ) ? $map[ $code ] : array( 'error', __( 'Nothing was changed.', 'hd-door-designer' ) );
	}

	// -------------------------------------------------------------------
	// Page
	// -------------------------------------------------------------------
	public function render() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$exp = HD_DD_Experiments::current();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Experiments', 'hd-door-designer' ); ?></h1>
			<?php
			if ( isset( $_GET['hd_dd_exp'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only result flag.
				list( $type, $text ) = self::notice( sanitize_key( wp_unslash( $_GET['hd_dd_exp'] ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
				printf( '<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr( $type ), esc_html( $text ) );
			}
			?>
			<p class="description">
				<?php
				/* translators: %s: default flow name */
				printf( esc_html__( 'Default flow (everyone, when no test runs): %s. Visits with ?flow= in the URL or a flow="" shortcode attribute are never counted.', 'hd-door-designer' ), '<strong>' . esc_html( HD_DD_Experiments::flow_label( HD_DD_Experiments::default_flow() ) ) . '</strong>' );
				?>
			</p>
			<?php
			if ( $exp ) {
				$this->render_current( $exp );
			} else {
				$this->render_start();
			}
			$this->render_history();
			?>
		</div>
		<?php
	}

	private function render_current( array $exp ) {
		$arms     = HD_DD_Experiments::arms( $exp );
		$decision = HD_DD_Experiments::evaluate( $exp );
		$control  = $arms['control']['label'];
		$chal     = $arms['challenger']['label'];
		$badges   = array(
			'running'       => array( '#e7f0fb', '#1d4f91', __( 'Running', 'hd-door-designer' ) ),
			'winner_found'  => array( '#e3f6e8', '#1a6b34', __( 'Winner found — your call', 'hd-door-designer' ) ),
			'no_difference' => array( '#fff4d6', '#7a5a00', __( 'No clear difference — your call', 'hd-door-designer' ) ),
		);
		$badge    = isset( $badges[ $exp['status'] ] ) ? $badges[ $exp['status'] ] : $badges['running'];
		?>
		<h2>
			<?php echo esc_html( sprintf( '%s vs %s', $control, $chal ) ); ?>
			<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:3px;font-size:12px;vertical-align:middle;background:<?php echo esc_attr( $badge[0] ); ?>;color:<?php echo esc_attr( $badge[1] ); ?>;"><?php echo esc_html( $badge[2] ); ?></span>
		</h2>
		<p>
			<?php
			/* translators: 1: challenger, 2: percent, 3: control, 4: start date, 5: days */
			echo esc_html( sprintf( __( '%1$s gets %2$d%% of new visitors, %3$s the rest. Started %4$s UTC — %5$d days ago.', 'hd-door-designer' ), $chal, (int) $exp['percent'], $control, $exp['started_at'], HD_DD_Experiments::days_run( $exp ) ) );
			?>
		</p>
		<?php $this->render_split( $exp, $chal ); ?>
		<table class="widefat striped" style="max-width:820px;">
			<thead><tr>
				<th><?php esc_html_e( 'Flow', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Visitors (opened the designer)', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Leads', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Conversion rate', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Expected loss if you pick it', 'hd-door-designer' ); ?></th>
			</tr></thead>
			<tbody>
				<?php foreach ( $arms as $key => $arm ) : ?>
					<tr>
						<td><strong><?php echo esc_html( $arm['label'] ); ?></strong> <small>(<?php echo esc_html( $key ); ?>)</small></td>
						<td><?php echo (int) $arm['visitors']; ?></td>
						<td><?php echo (int) $arm['leads']; ?></td>
						<td><?php echo esc_html( HD_DD_Experiment_Notifier::pct( $decision['rates'][ $key ], 1 ) ); ?></td>
						<td><?php echo esc_html( number_format( 100 * $decision['loss'][ $key ], 2 ) . ' ' . __( 'points', 'hd-door-designer' ) ); ?></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		<p style="font-size:14px;">
			<?php
			/* translators: 1: challenger, 2: control, 3: probability */
			echo esc_html( sprintf( __( 'Chance %1$s beats %2$s: %3$s', 'hd-door-designer' ), $chal, $control, HD_DD_Experiment_Notifier::pct( $decision['prob_challenger_better'] ) ) );
			?>
		</p>
		<p>
			<?php
			echo esc_html(
				$decision['guards']
					? __( 'Still needed before a winner can be called: ', 'hd-door-designer' ) . implode( ', ', $decision['guards'] )
					/* translators: %s: probability threshold */
					: sprintf( __( 'All minimums met — a winner is called once one flow reaches a %s chance of being better.', 'hd-door-designer' ), HD_DD_Experiment_Notifier::pct( HD_DD_Experiments::rule()['prob_threshold'], 1 ) )
			);
			?>
		</p>
		<?php if ( ! empty( $exp['unattributed'] ) ) : ?>
			<p>
				<?php
				/* translators: %d: count */
				echo esc_html( sprintf( __( '%d enquiries came from visitors with no recorded designer visit, so they are not counted above.', 'hd-door-designer' ), (int) $exp['unattributed'] ) );
				?>
			</p>
		<?php endif; ?>
		<p class="description" style="max-width:820px;"><?php echo esc_html( HD_DD_Experiment_Notifier::context_note() ); ?></p>

		<p style="display:flex;gap:8px;flex-wrap:wrap;">
			<?php foreach ( $arms as $arm ) : ?>
				<?php $this->action_form( 'make_default', array( 'flow' => $arm['flow'] ), sprintf( /* translators: %s: flow */ __( 'Make %s the default', 'hd-door-designer' ), $arm['label'] ), 'button-primary', __( 'End the test and show this flow to every visitor?', 'hd-door-designer' ) ); ?>
			<?php endforeach; ?>
			<?php $this->action_form( 'stop', array(), __( 'Stop test', 'hd-door-designer' ), 'button-secondary', __( 'Stop the test? The default flow stays as it is.', 'hd-door-designer' ) ); ?>
		</p>
		<?php
	}

	/** The running test's split: change form, what a change means, and the changes so far. */
	private function render_split( array $exp, $chal ) {
		?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin:0 0 8px;">
			<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION ); ?>" />
			<input type="hidden" name="do" value="set_percent" />
			<?php wp_nonce_field( self::ACTION ); ?>
			<label for="hd_exp_split">
				<?php
				/* translators: %s: challenger flow */
				echo esc_html( sprintf( __( '%% of new visitors to %s', 'hd-door-designer' ), $chal ) );
				?>
			</label>
			<input type="number" name="percent" id="hd_exp_split" min="1" max="99" value="<?php echo (int) $exp['percent']; ?>" class="small-text" /> %
			<button type="submit" class="button button-secondary"><?php esc_html_e( 'Update split', 'hd-door-designer' ); ?></button>
		</form>
		<p class="description" style="max-width:820px;"><?php esc_html_e( 'A new split applies to new visitors only — anyone already in the test keeps their flow, and cached pages may use the old split for a while. Changing it mid-test can skew the comparison if conversion rates shift over time.', 'hd-door-designer' ); ?></p>
		<?php foreach ( self::split_changes( $exp ) as $line ) : ?>
			<p class="description" style="margin:0;"><?php echo esc_html( $line ); ?></p>
		<?php endforeach; ?>
		<?php
	}

	/** @return string[] One line per logged split change: "2026-10-05 14:02 UTC: 40% → 25%". */
	public static function split_changes( array $exp ) {
		$out = array();
		foreach ( ( isset( $exp['split_changes'] ) && is_array( $exp['split_changes'] ) ) ? $exp['split_changes'] : array() as $c ) {
			$out[] = sprintf( '%s UTC: %d%% → %d%%', substr( (string) $c['at'], 0, 16 ), (int) $c['from'], (int) $c['to'] );
		}
		return $out;
	}

	/** One-button admin-post form. */
	private function action_form( $do, array $fields, $label, $class, $confirm ) {
		?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" onsubmit="return window.confirm( <?php echo esc_attr( wp_json_encode( $confirm ) ); ?> );">
			<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION ); ?>" />
			<input type="hidden" name="do" value="<?php echo esc_attr( $do ); ?>" />
			<?php foreach ( $fields as $name => $value ) : ?>
				<input type="hidden" name="<?php echo esc_attr( $name ); ?>" value="<?php echo esc_attr( $value ); ?>" />
			<?php endforeach; ?>
			<?php wp_nonce_field( self::ACTION ); ?>
			<button type="submit" class="button <?php echo esc_attr( $class ); ?>"><?php echo esc_html( $label ); ?></button>
		</form>
		<?php
	}

	private function render_start() {
		$flows   = HD_DD_Experiments::flows();
		$default = HD_DD_Experiments::default_flow();
		$other   = '';
		foreach ( array_keys( $flows ) as $f ) {
			if ( $f !== $default ) {
				$other = $f;
				break;
			}
		}
		?>
		<h2><?php esc_html_e( 'Start a new test', 'hd-door-designer' ); ?></h2>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION ); ?>" />
			<input type="hidden" name="do" value="start" />
			<?php wp_nonce_field( self::ACTION ); ?>
			<table class="form-table" role="presentation">
				<?php foreach ( array( 'control' => array( __( 'Control (current flow)', 'hd-door-designer' ), $default ), 'challenger' => array( __( 'Challenger (new flow)', 'hd-door-designer' ), $other ) ) as $name => $row ) : ?>
					<tr>
						<th scope="row"><label for="hd_exp_<?php echo esc_attr( $name ); ?>"><?php echo esc_html( $row[0] ); ?></label></th>
						<td><select name="<?php echo esc_attr( $name ); ?>" id="hd_exp_<?php echo esc_attr( $name ); ?>">
							<?php foreach ( $flows as $key => $label ) : ?>
								<option value="<?php echo esc_attr( $key ); ?>" <?php selected( $row[1], $key ); ?>><?php echo esc_html( $label ); ?></option>
							<?php endforeach; ?>
						</select></td>
					</tr>
				<?php endforeach; ?>
				<tr>
					<th scope="row"><label for="hd_exp_percent"><?php esc_html_e( '% of visitors to the challenger', 'hd-door-designer' ); ?></label></th>
					<td><input type="number" name="percent" id="hd_exp_percent" min="1" max="99" value="50" class="small-text" /> %</td>
				</tr>
			</table>
			<?php submit_button( __( 'Start test', 'hd-door-designer' ) ); ?>
		</form>
		<?php
	}

	private function render_history() {
		$history = array_reverse( HD_DD_Experiments::history() );
		if ( ! $history ) {
			return;
		}
		?>
		<h2><?php esc_html_e( 'Finished tests', 'hd-door-designer' ); ?></h2>
		<table class="widefat striped" style="max-width:1000px;">
			<thead><tr>
				<th><?php esc_html_e( 'Dates (UTC)', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Flows', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Final numbers', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Outcome', 'hd-door-designer' ); ?></th>
			</tr></thead>
			<tbody>
				<?php foreach ( $history as $h ) : ?>
					<tr>
						<td><?php echo esc_html( substr( $h['started_at'], 0, 10 ) . ' → ' . substr( $h['ended_at'], 0, 10 ) ); ?></td>
						<td><?php echo esc_html( HD_DD_Experiments::flow_label( $h['control'] ) . ' vs ' . HD_DD_Experiments::flow_label( $h['challenger'] ) . ' (' . (int) $h['percent'] . '%)' ); ?>
							<?php foreach ( self::split_changes( $h ) as $line ) : ?>
								<br><small><?php echo esc_html( $line ); ?></small>
							<?php endforeach; ?>
						</td>
						<td>
							<?php foreach ( (array) $h['stats'] as $arm ) : ?>
								<?php echo esc_html( sprintf( '%s: %d visitors, %d leads', $arm['label'], $arm['visitors'], $arm['leads'] ) ); ?><br>
							<?php endforeach; ?>
						</td>
						<td><?php echo esc_html( self::outcome_label( $h['outcome'] ) ); ?></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		<?php
	}

	/** 'made_default:swipe' → "Swipe made the default"; 'stopped' → "Stopped". */
	public static function outcome_label( $outcome ) {
		if ( 0 === strpos( (string) $outcome, 'made_default:' ) ) {
			/* translators: %s: flow */
			return sprintf( __( '%s made the default', 'hd-door-designer' ), HD_DD_Experiments::flow_label( substr( $outcome, 13 ) ) );
		}
		return __( 'Stopped', 'hd-door-designer' );
	}
}
