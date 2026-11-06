<?php
/**
 * wp-admin views for the saver follow-ups: a status line with a "Stop follow-ups" button on a
 * saved design's screen, and the Settings section that starts follow-ups for earlier saves.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Follow_Up_Admin {

	/** One plain sentence about a save's follow-ups. */
	public static function status_text( $f ) {
		if ( ! $f ) {
			return __( 'No follow-up emails for this design.', 'hd-door-designer' );
		}
		$sent = (int) $f->sent_steps;
		/* translators: 1: emails sent, 2: total emails */
		$text = sprintf( __( '%1$d of %2$d follow-up emails sent.', 'hd-door-designer' ), $sent, HD_DD_Follow_Up_Plan::STEPS );
		if ( $f->stopped_at ) {
			$why   = isset( HD_DD_Follow_Up::REASONS[ $f->stop_reason ] ) ? HD_DD_Follow_Up::REASONS[ $f->stop_reason ] : (string) $f->stop_reason;
			$text .= ' ' . sprintf( /* translators: %s: reason */ __( 'Stopped: %s.', 'hd-door-designer' ), $why );
			return $text;
		}
		$due = HD_DD_Follow_Up_Plan::next_due( strtotime( $f->started_at . ' UTC' ), $sent, $f->last_sent_at ? strtotime( $f->last_sent_at . ' UTC' ) : null );
		if ( $due ) {
			$text .= ' ' . sprintf( /* translators: %s: date */ __( 'Next one from %s (sent between 8am and 8pm).', 'hd-door-designer' ), wp_date( 'j M H:i', $due ) );
		}
		return $text;
	}

	/** The block on a saved design's screen. */
	public static function render_detail_box( $row ) {
		if ( ! $row || 'save' !== ( isset( $row->kind ) ? $row->kind : '' ) ) {
			return;
		}
		$f = HD_DD_Follow_Up::get( (int) $row->id );
		?>
		<div class="notice notice-info inline" style="margin:12px 0;">
			<p>
				<strong><?php esc_html_e( 'Follow-up emails:', 'hd-door-designer' ); ?></strong>
				<?php echo esc_html( self::status_text( $f ) ); ?>
			</p>
			<?php if ( $f && ! $f->stopped_at ) : ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin:0 0 10px;">
					<input type="hidden" name="action" value="<?php echo esc_attr( HD_DD_Follow_Up::ADMIN_STOP ); ?>" />
					<input type="hidden" name="enquiry_id" value="<?php echo (int) $row->id; ?>" />
					<?php wp_nonce_field( HD_DD_Follow_Up::ADMIN_STOP . '_' . (int) $row->id ); ?>
					<button type="submit" class="button"><?php esc_html_e( 'Stop follow-ups (they replied)', 'hd-door-designer' ); ?></button>
				</form>
			<?php endif; ?>
			<?php $events = $f ? HD_DD_Follow_Up_Log::for_enquiry( (int) $row->id ) : array(); ?>
			<?php if ( $events ) : ?>
				<ul style="margin:0 0 10px;list-style:disc;padding-left:20px;">
					<?php foreach ( $events as $e ) : ?>
						<li><?php echo esc_html( self::when( $e->at ) . ' — ' . HD_DD_Follow_Up_Log::describe( $e ) ); ?></li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>
		</div>
		<?php
	}

	/** The Settings section: what the follow-ups are and the button for earlier saves. */
	public static function render_settings_section() {
		$candidates = HD_DD_Follow_Up::backfill_candidates();
		?>
		<hr>
		<h2><?php esc_html_e( 'Follow-up emails to savers', 'hd-door-designer' ); ?></h2>
		<p class="description">
			<?php esc_html_e( 'Someone who saves a design and does not ask for a price gets three short emails from Daniel, about 1, 2 and 4 days later (8am to 8pm only). They stop as soon as that person asks for a price or a call back, or clicks "No more emails". Replies go to the first enquiry email address above; if someone replies, open their saved design and press "Stop follow-ups".', 'hd-door-designer' ); ?>
		</p>
		<?php if ( isset( $_GET['followups_started'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only flag. ?>
			<div class="notice notice-success inline"><p>
				<?php echo esc_html( sprintf( /* translators: %d: count */ __( 'Follow-ups started for %d earlier saves. The first emails go out within the hour (8am to 8pm).', 'hd-door-designer' ), (int) $_GET['followups_started'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
			</p></div>
		<?php endif; ?>
		<p><a href="<?php echo esc_url( HD_DD_Follow_Up_Page::url() ); ?>"><?php esc_html_e( 'See who is in the sequence, who finished and who dropped out →', 'hd-door-designer' ); ?></a></p>
		<?php self::render_report(); ?>
		<?php if ( $candidates ) : ?>
			<h3><?php esc_html_e( 'Earlier saves', 'hd-door-designer' ); ?></h3>
			<p><?php echo esc_html( sprintf( /* translators: %d: count */ _n( '%d earlier save has not been followed up:', '%d earlier saves have not been followed up:', count( $candidates ), 'hd-door-designer' ), count( $candidates ) ) ); ?></p>
			<ul style="list-style:disc;padding-left:20px;">
				<?php foreach ( $candidates as $c ) : ?>
					<li><?php echo esc_html( mysql2date( 'j M Y', $c->created_at ) . ' — ' . $c->customer_email . ( '' !== (string) $c->design_name ? ' — ' . $c->design_name : '' ) ); ?></li>
				<?php endforeach; ?>
			</ul>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( HD_DD_Follow_Up::BACKFILL ); ?>" />
				<?php wp_nonce_field( HD_DD_Follow_Up::BACKFILL ); ?>
				<?php submit_button( __( 'Start follow-ups for these saves', 'hd-door-designer' ), 'secondary', 'submit', false ); ?>
			</form>
		<?php else : ?>
			<p><?php esc_html_e( 'Every earlier save is either followed up already or has gone on to ask for a price.', 'hd-door-designer' ); ?></p>
		<?php endif; ?>
		<?php
	}

	/** UK date and time for a stored UTC time. */
	private static function when( $mysql ) {
		return wp_date( 'j M Y, H:i', strtotime( $mysql . ' UTC' ) );
	}

	private static function pct( $n, $of ) {
		return $of > 0 ? ' (' . round( 100 * $n / $of ) . '%)' : '';
	}

	/** Totals per email, how sequences ended, and the log of who was sent what and when. */
	public static function render_report() {
		$sum = HD_DD_Follow_Up_Log::summarise( HD_DD_Follow_Up_Log::all() );
		$out = HD_DD_Follow_Up_Log::outcomes();
		$log = HD_DD_Follow_Up_Log::recent( 100 );
		$ref = admin_url( 'admin.php?page=hd-door-enquiries&enquiry=' );
		?>
		<h3><?php esc_html_e( 'How the follow-ups are doing', 'hd-door-designer' ); ?></h3>
		<table class="widefat striped" style="max-width:820px;">
			<thead><tr>
				<th><?php esc_html_e( 'Email', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Sent to', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Clicked a button', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Then asked for a price', 'hd-door-designer' ); ?></th>
				<th><?php esc_html_e( 'Then asked for a call back', 'hd-door-designer' ); ?></th>
			</tr></thead>
			<tbody>
				<?php foreach ( array( 1 => __( '1. In daylight (day 1)', 'hd-door-designer' ), 2 => __( '2. Fitted price (day 2)', 'hd-door-designer' ), 3 => __( '3. Still thinking? (day 4)', 'hd-door-designer' ) ) as $n => $label ) : ?>
					<?php $r = $sum[ $n ]; ?>
					<tr>
						<td><?php echo esc_html( $label ); ?></td>
						<td><?php echo (int) $r['sent']; ?></td>
						<td><?php echo esc_html( $r['clicked'] . self::pct( $r['clicked'], $r['sent'] ) ); ?></td>
						<td><?php echo esc_html( $r['quotes'] . self::pct( $r['quotes'], $r['sent'] ) ); ?></td>
						<td><?php echo (int) $r['callbacks']; ?></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		<p class="description">
			<?php
			echo esc_html(
				sprintf(
					/* translators: 1: people, 2: running, 3: asked, 4: no more emails, 5: replied */
					__( '%1$d people followed up: %2$d still running, %3$d asked for a price or call back, %4$d clicked "No more emails", %5$d stopped by hand after replying.', 'hd-door-designer' ),
					$out['total'],
					$out['running'],
					isset( $out['converted'] ) ? $out['converted'] : 0,
					isset( $out['unsubscribed'] ) ? $out['unsubscribed'] : 0,
					isset( $out['replied'] ) ? $out['replied'] : 0
				)
			);
			?>
			<?php esc_html_e( '"Then asked" counts people whose last follow-up was that email. Clicks within two minutes of sending are ignored (email security scanners open links), and opens are not counted because many mail apps open every email automatically.', 'hd-door-designer' ); ?>
		</p>

		<h3><?php esc_html_e( 'Sent emails and what happened', 'hd-door-designer' ); ?></h3>
		<?php if ( ! $log ) : ?>
			<p><?php esc_html_e( 'Nothing sent yet.', 'hd-door-designer' ); ?></p>
		<?php else : ?>
			<div style="max-height:420px;overflow:auto;max-width:1020px;">
				<table class="widefat striped">
					<thead><tr>
						<th><?php esc_html_e( 'When (UK)', 'hd-door-designer' ); ?></th>
						<th><?php esc_html_e( 'Who', 'hd-door-designer' ); ?></th>
						<th><?php esc_html_e( 'Design', 'hd-door-designer' ); ?></th>
						<th><?php esc_html_e( 'What happened', 'hd-door-designer' ); ?></th>
					</tr></thead>
					<tbody>
						<?php foreach ( $log as $e ) : ?>
							<tr>
								<td style="white-space:nowrap;"><?php echo esc_html( self::when( $e->at ) ); ?></td>
								<td><?php echo esc_html( (string) $e->customer_email ); ?></td>
								<td><a href="<?php echo esc_url( $ref . (int) $e->enquiry_id ); ?>"><?php echo esc_html( trim( (string) $e->reference . ' ' . (string) $e->design_name ) ); ?></a></td>
								<td><?php echo esc_html( HD_DD_Follow_Up_Log::describe( $e ) ); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			</div>
			<p class="description"><?php esc_html_e( 'The latest 100 events. Open a saved design in Door Enquiries to see its full history.', 'hd-door-designer' ); ?></p>
		<?php endif; ?>
		<?php
	}
}
