/**
 * Casiopea-Con§tel — lectura sobre la página.
 *
 * Carga los §§ de la página, los dibuja según el alcance (míos/todos), abre
 * el detalle al activar una marca y, si el lector puede anotar, instala la
 * afordancia "§". El servidor decide si este módulo se carga (PageHooks).
 */
const api = require( 'ext.constel.ui' ).api;
const marks = require( './marks.js' );
const panel = require( 'ext.constel.ui' ).panel;
const menu = require( './menu.js' );
const minimap = require( './minimap.js' );
const trigger = require( './trigger.js' );
const form = require( './form.js' );
const detail = require( 'ext.constel.ui' ).detail;

const cfg = mw.config.get( 'wgConstel' );
const me = mw.config.get( 'wgUserName' );
const isMine = ( excerpt ) => excerpt.author === me;

function main( root ) {
	const state = menu.load();
	let excerpts = [];

	const render = () => {
		document.body.classList.toggle( 'constel-marks-hidden', !state.marks );
		const visible = state.scope === 'mine' ? excerpts.filter( isMine ) : excerpts;
		marks.draw( root, visible, isMine );
		minimap.update( root, state.marks ? visible : [], isMine );
	};
	const reload = () => api.listExcerpts( cfg.pageId ).then( ( list ) => {
		excerpts = list;
		render();
	} );

	menu.bind( state, render );

	const openDetail = ( target ) => {
		const ids = marks.excerptIdsAt( target, root );
		const here = excerpts.filter( ( e ) => ids.includes( e.id ) );
		if ( !here.length ) {
			return;
		}
		detail.open( here, {
			near: target.getBoundingClientRect(),
			// Al lado del inicio del (primer) §, no de donde se hizo clic.
			anchor: root.querySelector( '[data-constel-excerpt="' + here[ 0 ].id + '"]' ) || target,
			returnFocus: target.closest( '[tabindex="0"]' ) || target,
			isMine,
			canAnnotate: cfg.canAnnotate,
			canModerate: cfg.canModerate,
			onChanged: reload
		} );
	};
	root.addEventListener( 'click', ( e ) => {
		// Un clic que termina una selección no abre el detalle.
		const sel = window.getSelection();
		if ( e.target.closest( '.' + marks.MARK_CLASS ) && ( !sel || sel.isCollapsed ) ) {
			openDetail( e.target );
		}
	} );
	root.addEventListener( 'keydown', ( e ) => {
		if ( ( e.key === 'Enter' || e.key === ' ' ) && e.target.classList.contains( marks.MARK_CLASS ) ) {
			e.preventDefault();
			openDetail( e.target );
		}
	} );

	if ( cfg.canAnnotate ) {
		trigger.install( root, ( selection, button ) => {
			form.open( selection, {
				pageId: cfg.pageId,
				revId: cfg.revId,
				returnFocus: button,
				onCreated: () => {
					window.getSelection().removeAllRanges();
					// El § nuevo es propio: si se ven sólo los míos, igual aparece.
					reload();
				}
			} );
		} );
	}

	reload();
	// Cerrar paneles si el contenido se re-renderiza (p. ej. vista previa en vivo).
	mw.hook( 'wikipage.content' ).add( () => panel.close() );
}

// Sólo para los tests QUnit (tests/qunit): la lógica pura del cliente.
module.exports = {
	canonical: require( './canonical.js' ),
	locate: require( './locate.js' ).locate
};

$( () => {
	const root = document.querySelector( '#mw-content-text .mw-parser-output' );
	if ( root && cfg ) {
		main( root );
	}
} );
