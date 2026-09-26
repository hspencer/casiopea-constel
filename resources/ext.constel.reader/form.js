/**
 * Formulario del § (spec: SelectionPopup): conceptos como píldoras con
 * autocompletado del vocabulario compartido (una coma cierra cada uno);
 * variantes ofrecidas antes de crear una nueva (VariantsSteered); aviso de
 * datos públicos la primera vez (ReadingIsPublicData); vista vieja informada
 * sin perder lo escrito (StaleViewReported).
 */
const api = require( 'ext.constel.ui' ).api;
const panel = require( 'ext.constel.ui' ).panel;
const conceptPills = require( 'ext.constel.ui' ).conceptPills;
const variants = require( 'ext.constel.ui' ).variants;

function el( tag, className, text ) {
	const node = document.createElement( tag );
	if ( className ) {
		node.className = className;
	}
	if ( text !== undefined ) {
		node.textContent = text;
	}
	return node;
}

/**
 * @param {Object} selection {exact, prefix, suffix, start, rect, range}
 * @param {Object} ctx {pageId, revId, onCreated, returnFocus}
 */
function open( selection, ctx ) {
	const p = panel.open( {
		label: mw.msg( 'constel-form-title' ),
		near: selection.rect,
		anchor: selection.range,
		returnFocus: ctx.returnFocus
	} );

	const form = el( 'form', 'constel-form' );
	const title = el( 'p', 'constel-panel__title' );
	title.append( el( 'span', 'constel-sign', '§' ), ' ', mw.msg( 'constel-form-title' ) );
	const quote = el( 'blockquote', 'constel-quote' );
	quote.textContent = selection.exact.length > 160 ?
		selection.exact.slice( 0, 157 ) + '…' :
		selection.exact;

	const inputId = 'constel-concept-input';
	const label = el( 'label', 'constel-label', mw.msg( 'constel-form-concept-label' ) );
	label.htmlFor = inputId;
	const concepts = conceptPills.create( {
		id: inputId,
		placeholder: mw.msg( 'constel-form-concept-placeholder' ),
		maxLength: require( './config.json' ).conceptMaxLength
	} );

	const glossId = 'constel-gloss-input';
	const glossLabel = el( 'label', 'constel-label', mw.msg( 'constel-form-gloss-label' ) );
	glossLabel.htmlFor = glossId;
	const gloss = el( 'textarea', 'constel-input constel-gloss' );
	gloss.id = glossId;
	gloss.rows = 3;
	gloss.placeholder = mw.msg( 'constel-form-gloss-placeholder' );
	// Enter en la glosa es salto de línea; Ctrl/Cmd+Enter envía.
	gloss.addEventListener( 'keydown', ( e ) => {
		if ( e.key === 'Enter' && ( e.ctrlKey || e.metaKey ) ) {
			e.preventDefault();
			form.requestSubmit();
		}
	} );

	const feedback = el( 'div', 'constel-feedback' );
	feedback.setAttribute( 'role', 'alert' );

	const actions = el( 'div', 'constel-actions' );
	const submit = el( 'button', 'constel-button constel-button--primary', mw.msg( 'constel-form-submit' ) );
	submit.type = 'submit';
	// Un solo botón: se descarta con × o Escape.
	actions.append( submit );

	form.append( title, quote, label, concepts.el, glossLabel, gloss );
	if ( !Number( mw.user.options.get( 'constel-public-ack' ) ) ) {
		form.append( el( 'p', 'constel-notice', mw.msg( 'constel-form-public-notice' ) ) );
	}
	form.append( feedback, actions );
	p.body.appendChild( form );
	panel.reposition( selection.rect );

	concepts.input.focus();

	// Un solo envío a la vez: un doble Enter no crea dos §§ iguales.
	let sending = false;
	// El § nace con el primer concepto; los demás se le suman. Si uno pide
	// elegir variante, los ya guardados salen del campo y el resto espera.
	let excerptId = null;
	let queue = [];

	const done = () => {
		if ( !Number( mw.user.options.get( 'constel-public-ack' ) ) ) {
			mw.user.options.set( 'constel-public-ack', '1' );
			api.saveAck();
		}
		panel.close();
		ctx.onCreated();
	};

	const step = ( allowVariant ) => {
		if ( !queue.length ) {
			done();
			return;
		}
		const concept = queue[ 0 ];
		const request = excerptId === null ? {
			action: 'constel-createexcerpt',
			pageid: ctx.pageId,
			revid: ctx.revId,
			exact: selection.exact,
			prefix: selection.prefix,
			suffix: selection.suffix,
			start: selection.start,
			concept,
			gloss: gloss.value.trim() || undefined
		} : { action: 'constel-codeexcerpt', excerpt: excerptId, concept };
		request.allowvariant = allowVariant ? 1 : undefined;
		api.write( request ).then( ( result ) => {
			if ( excerptId === null ) {
				excerptId = result.excerpt;
			}
			queue.shift();
			concepts.remove( concept );
			step( false );
		}, ( code, result ) => {
			sending = false;
			submit.disabled = false;
			const error = api.describeError( code, result );
			feedback.innerHTML = error.html;
			if ( error.code === 'variants' ) {
				variants.render( feedback, error, concept, {
					choose: ( variant ) => {
						concepts.replace( concept, variant );
						queue[ 0 ] = variant;
						resume( false );
					},
					createAnyway: () => resume( true )
				} );
			} else if ( error.code === 'staleview' ) {
				const reload = el( 'a', 'constel-link', mw.msg( 'constel-form-reload' ) );
				reload.href = location.href;
				feedback.append( ' ', reload );
			}
			panel.reposition( selection.rect );
		} );
	};

	function resume( allowVariant ) {
		if ( sending ) {
			return;
		}
		sending = true;
		submit.disabled = true;
		feedback.textContent = mw.msg( 'constel-form-saving' );
		step( allowVariant );
	}

	form.addEventListener( 'submit', ( e ) => {
		e.preventDefault();
		if ( concepts.isOpen() || sending ) {
			return;
		}
		queue = concepts.values();
		if ( !queue.length ) {
			concepts.input.focus();
			return;
		}
		resume( false );
	} );
}

module.exports = { open };
