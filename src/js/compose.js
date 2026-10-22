// Compose page glue: Cc/Bcc rows, discard, formatting toolbar toggle, TinyMCE configuration
// (Gmail-like toolbar at the bottom of the editor, our embed.css inside the editable area).
import { modal } from './modal.js';
import { recipients } from './recipients.js';

const html = document.documentElement;
const label = (n) => (window.rcmail?.get_label ? rcmail.get_label(n) : n);

export const compose = {
  show_header(name) {
    const row = document.getElementById(`compose_${name}`);
    if (!row) return false;
    row.classList.remove('hidden');
    document.querySelector(`.gm-hlink[data-header="${name}"]`)?.classList.add('hidden');
    const input = row.querySelector('ul.recipient-input input, input, textarea');
    input?.focus();
    return false;
  },

  header_reset(id) {
    const input = document.getElementById(id);
    const row = input?.closest('.gm-hrow');
    if (!input || !row) return false;
    input.value = '';
    // recipient widget: remove chips
    row.querySelectorAll('ul.recipient-input > li.recipient').forEach((li) => li.remove());
    row.querySelectorAll('ul.recipient-input input').forEach((i) => (i.value = ''));
    row.classList.add('hidden');
    document
      .querySelector(`.gm-hlink[data-header="${id.replace(/^_/, '')}"]`)
      ?.classList.remove('hidden');
    if (window.rcmail) rcmail.compose_type_activity++;
    return false;
  },

  discard() {
    const rc = window.rcmail;
    if (!rc) return false;
    const dirty = typeof rc.cmp_hash === 'string' && rc.cmp_hash !== rc.compose_field_hash();
    const go = () => {
      rc.compose_skip_unsavedcheck = true;
      rc.env.gm_discarded = true; // compose-window.js: no "message sent" toast for a discarded draft
      if (rc.env.extwin) window.close();
      rc.command('list');
    };
    if (dirty) {
      modal
        .confirm(label('notsentwarning'), { okLabel: label('discard'), danger: true })
        .then((ok) => ok && go());
    } else go();
    return false;
  },

  toggle_toolbar() {
    html.classList.toggle('gm-editor-toolbar-hidden');
    const ed = window.rcmail?.editor;
    if (ed && !ed.is_html()) {
      // plain text → switch to HTML (Gmail has formatting on by default)
      window.rcmail.command('toggle-editor', { id: 'composebody', html: true });
      html.classList.remove('gm-editor-toolbar-hidden');
    }
    return false;
  },

  init() {
    // scheduled_sending renders "⏰ Send at" + a native datetime input; strip the emoji (icon comes
    // from CSS) — datetime.js replaces the native control.
    const ssLabel = document.querySelector('#ss-inline-schedule .ss-label');
    if (ssLabel) ssLabel.textContent = ssLabel.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const rc = window.rcmail;
    if (!rc || rc.env.action !== 'compose') return;

    // Elastic normally builds this menu; our skin owns that contract too.
    const spellMenu = document.getElementById('spell-menu');
    if (spellMenu) {
      const list = document.createElement('ul');
      list.className = 'menu listing';
      for (const [code, name] of Object.entries(rc.env.spell_langs || {})) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'active';
        link.textContent = name;
        link.dataset.lang = code;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          rc.spellcheck_lang_set(code);
          rc.hide_menu('spell-menu');
        });
        item.append(link);
        list.append(item);
      }
      spellMenu.replaceChildren(list);
      const trigger = document.querySelector('[data-popup="spell-menu"]');
      if (trigger && list.children.length) {
        trigger.classList.remove('disabled');
        trigger.parentElement.classList.remove('disabled');
      }
      rc.addEventListener('menu-open', ({ name }) => {
        if (name !== 'spell-menu') return;
        const current = rc.spellcheck_lang();
        for (const link of list.querySelectorAll('a')) {
          const selected = link.dataset.lang === current;
          link.classList.toggle('selected', selected);
          link.setAttribute('aria-selected', String(selected));
        }
      });
    }

    // recipient chips on To/Cc/Bcc/Reply-To/Followup-To (must run before rcmail.init() binds the textareas)
    recipients.init();

    // drag & drop overlay: show the drop area only while a file is dragged over the page
    let dragDepth = 0;
    document.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragDepth++;
      html.classList.add('gm-dragging');
    });
    document.addEventListener('dragleave', () => {
      if (--dragDepth <= 0) ((dragDepth = 0), html.classList.remove('gm-dragging'));
    });
    document.addEventListener(
      'drop',
      () => ((dragDepth = 0), html.classList.remove('gm-dragging'))
    );

    // rows pre-filled by the server (reply-all etc.) → show them
    for (const name of ['cc', 'bcc', 'replyto', 'followupto']) {
      const input = document.getElementById(`_${name}`);
      if (input && input.value.trim()) this.show_header(name);
    }

    // Gmail-like TinyMCE: no menubar, compact toolbar below the editing area, our content css
    rc.addEventListener('editor-init', (e) => {
      const c = e.config;
      c.menubar = false;
      c.statusbar = false;
      c.toolbar_location = 'bottom';
      c.toolbar_mode = 'sliding';
      c.toolbar =
        'undo redo | fontselect fontsizeselect | bold italic underline forecolor | alignleft aligncenter alignright | numlist bullist outdent indent | blockquote link image | removeformat';
      c.content_style =
        (c.content_style || '') +
        ' body{font-family:Roboto Flex,Roboto,system-ui,sans-serif;font-size:14px;line-height:1.5;margin:8px 0}';
      if (html.classList.contains('dark-mode')) c.skin = 'oxide-dark';
      const gmToxIcons = {
        undo: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M288 768V696H576Q626 696 661 661Q696 626 696 576Q696 526 661 491Q626 456 576 456H330L423 549L372 600L192 420L372 240L423 291L330 384H576Q656 384 712 440Q768 496 768 576Q768 656 712 712Q656 768 576 768Z"/></svg>',
        redo: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M384 768Q304 768 248 712Q192 656 192 576Q192 496 248 440Q304 384 384 384H630L537 291L588 240L768 420L588 600L537 549L630 456H384Q334 456 299 491Q264 526 264 576Q264 626 299 661Q334 696 384 696H672V768Z"/></svg>',
        bold: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M266 768V192H494Q561 192 618 233Q674 275 674 348Q674 399 652 428Q629 456 609 469Q635 481 665 512Q695 543 695 603Q695 694 628 731Q561 768 502 768ZM393 650H498Q546 650 556 626Q566 601 566 590Q566 579 556 554Q545 530 494 530H393ZM393 418H486Q519 418 534 400Q550 383 550 363Q550 339 533 324Q516 309 489 309H393Z"/></svg>',
        italic: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M216 768V672H376L500 288H336V192H744V288H596L472 672H624V768Z"/></svg>',
        underline: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M240 816V744H720V816ZM279 455V144H376V461Q376 514 403 547Q429 580 480 580Q531 580 557 547Q584 514 584 461V144H681V455Q681 553 628 613Q576 672 480 672Q384 672 332 613Q279 553 279 455Z"/></svg>',
        'strike-through': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M486 764Q414 764 360 722Q306 680 288 611L369 578Q385 629 416 655Q446 681 488 681Q533 681 560 660Q586 638 586 602Q586 586 580 572Q574 559 562 548H665Q670 559 672 572Q673 584 673 601Q673 673 621 718Q569 764 486 764ZM96 476V404H864V476ZM480 188Q544 188 586 215Q628 242 654 301L576 335Q565 305 540 286Q514 268 482 268Q445 268 420 286Q396 304 394 332H307Q309 269 358 228Q407 188 480 188Z"/></svg>',
        'text-color': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M257 624 437 144H523L703 624H620L577 501H384L340 624ZM408 432H552L482 238H478Z"/><path id="tox-icon-text-color__color" d="M120 864V768H840V864Z"/></svg>',
        'highlight-bg-color': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M216 51 267 0 605 338Q625 358 624 385Q624 412 605 431L431 605Q411 625 384 625Q357 625 337 605L163 430Q144 411 143 384Q142 357 163 337L333 168ZM384 219 219 384H549ZM648 588Q648 568 658 546Q669 523 692 491Q700 480 710 467Q721 454 732 441Q742 454 752 466Q763 479 772 491Q788 514 802 538Q816 562 816 588Q816 623 792 648Q767 672 732 672Q697 672 672 648Q648 623 648 588Z"/><path id="tox-icon-highlight-bg-color__color" d="M120 864V768H840V864Z"/></svg>',
        'align-left': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M144 816V744H816V816ZM144 666V594H624V666ZM144 516V444H816V516ZM144 366V294H624V366ZM144 216V144H816V216Z"/></svg>',
        'align-center': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M144 816V744H816V816ZM288 666V594H672V666ZM144 516V444H816V516ZM288 366V294H672V366ZM144 216V144H816V216Z"/></svg>',
        'align-right': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M144 216V144H816V216ZM336 366V294H816V366ZM144 516V444H816V516ZM336 666V594H816V666ZM144 816V744H816V816Z"/></svg>',
        'align-justify': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M144 816V744H816V816ZM144 666V594H816V666ZM144 516V444H816V516ZM144 366V294H816V366ZM144 216V144H816V216Z"/></svg>',
        'ordered-list': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M144 816V768H240V744H192V696H240V672H144V624H264Q274 624 281 631Q288 638 288 648V696Q288 706 281 713Q274 720 264 720Q274 720 281 727Q288 734 288 744V792Q288 802 281 809Q274 816 264 816ZM144 576V480Q144 470 151 463Q158 456 168 456H240V432H144V384H264Q274 384 281 391Q288 398 288 408V480Q288 490 281 497Q274 504 264 504H192V528H288V576ZM192 336V192H144V144H240V336ZM360 720V648H816V720ZM360 516V444H816V516ZM360 312V240H816V312Z"/></svg>',
        'unordered-list': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M360 720V648H816V720ZM360 516V444H816V516ZM360 312V240H816V312ZM216 756Q186 756 165 735Q144 714 144 684Q144 654 165 633Q186 612 216 612Q246 612 267 633Q288 654 288 684Q288 714 267 735Q246 756 216 756ZM216 552Q186 552 165 531Q144 510 144 480Q144 450 165 429Q186 408 216 408Q246 408 267 429Q288 450 288 480Q288 510 267 531Q246 552 216 552ZM216 348Q186 348 165 327Q144 306 144 276Q144 246 165 225Q186 204 216 204Q246 204 267 225Q288 246 288 276Q288 306 267 327Q246 348 216 348Z"/></svg>',
        outdent: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M144 816V744H816V816ZM432 666V594H816V666ZM432 516V444H816V516ZM432 366V294H816V366ZM144 216V144H816V216ZM288 624 144 480 288 336Z"/></svg>',
        indent: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M144 816V744H816V816ZM432 666V594H816V666ZM432 516V444H816V516ZM432 366V294H816V366ZM144 216V144H816V216ZM144 624V336L288 480Z"/></svg>',
        quote: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M253 672 327 543Q280 543 244 506Q208 468 208 416Q208 362 245 325Q282 288 336 288Q390 288 427 325Q464 362 464 416Q464 431 460 446Q455 462 446 479L336 672ZM541 672 615 543Q568 543 532 506Q496 468 496 416Q496 362 533 325Q570 288 624 288Q678 288 715 325Q752 362 752 416Q752 433 748 449Q743 465 735 479L624 672ZM336 472Q359 472 376 456Q392 439 392 416Q392 393 376 376Q359 360 336 360Q313 360 296 376Q280 393 280 416Q280 439 296 456Q313 472 336 472ZM624 472Q647 472 664 456Q680 439 680 416Q680 393 664 376Q647 360 624 360Q601 360 584 376Q568 393 568 416Q568 439 584 456Q601 472 624 472Z"/></svg>',
        link: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M432 672H288Q208 672 152 616Q96 560 96 480Q96 400 152 344Q208 288 288 288H432V360H288Q238 360 203 395Q168 430 168 480Q168 530 203 565Q238 600 288 600H432ZM336 516V444H624V516ZM528 672V600H672Q722 600 757 565Q792 530 792 480Q792 430 757 395Q722 360 672 360H528V288H672Q752 288 808 344Q864 400 864 480Q864 560 808 616Q752 672 672 672Z"/></svg>',
        unlink: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M754 652 698 597Q740 586 766 553Q792 521 792 480Q792 430 757 395Q722 360 672 360H528V288H672Q752 288 808 344Q864 400 864 480Q864 535 834 581Q805 627 754 652ZM618 516 546 444H624V516ZM768 870 90 192 141 141 819 819ZM432 672H288Q208 672 152 616Q96 560 96 480Q96 416 134 366Q172 316 242 287L312 360H289Q238 360 203 395Q168 430 168 480Q168 530 203 565Q238 600 288 600H432ZM336 516V444H392L463 516Z"/></svg>',
        image: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M216 816Q186 816 165 794Q144 773 144 744V216Q144 187 165 166Q186 144 216 144H744Q774 144 795 166Q816 187 816 216V744Q816 773 795 794Q774 816 744 816ZM216 744H744V216H216V744ZM264 672H696L552 480L444 624L372 528Z"/></svg>',
        'remove-formatting': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M503 402 430 329 342 241H768V337H531ZM768 871 442 545 366 721H262L369 472L90 193L141 142L819 820Z"/></svg>',
        'more-drawer': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M264 552Q234 552 213 531Q192 510 192 480Q192 450 213 429Q234 408 264 408Q294 408 315 429Q336 450 336 480Q336 510 315 531Q294 552 264 552ZM480 552Q450 552 429 531Q408 510 408 480Q408 450 429 429Q450 408 480 408Q510 408 531 429Q552 450 552 480Q552 510 531 531Q510 552 480 552ZM696 552Q666 552 645 531Q624 510 624 480Q624 450 645 429Q666 408 696 408Q726 408 747 429Q768 450 768 480Q768 510 747 531Q726 552 696 552Z"/></svg>',
        'chevron-down': '<svg width="16" height="16" viewBox="0 0 960 960"><path d="M480 627 240 387 291 336 480 525 669 336 720 387Z"/></svg>',
        close: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M291 720 240 669 429 480 240 291 291 240 480 429 669 240 720 291 531 480 720 669 669 720 480 531Z"/></svg>',
        sourcecode: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M336 720 96 480 336 240 387 291 198 480 387 669ZM624 720 573 669 762 480 573 291 624 240 864 480Z"/></svg>',
        search: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M765 816 526 577Q496 599 460 612Q424 624 384 624Q284 624 214 554Q144 484 144 384Q144 284 214 214Q284 144 384 144Q484 144 554 214Q624 284 624 384Q624 424 612 460Q599 496 577 526L816 765ZM384 552Q454 552 503 503Q552 454 552 384Q552 314 503 265Q454 216 384 216Q314 216 265 265Q216 314 216 384Q216 454 265 503Q314 552 384 552Z"/></svg>',
        table: '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M744 816H216Q187 816 166 794Q144 773 144 744V216Q144 186 166 165Q187 144 216 144H744Q773 144 794 165Q816 186 816 216V744Q816 773 794 794Q773 816 744 816ZM216 324H744V216H216ZM312 396H216V744H312ZM648 396V744H744V396ZM576 396H384V744H576Z"/></svg>',
        'horizontal-rule': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M192 516V444H768V516Z"/></svg>',
        'color-picker': '<svg width="20" height="20" viewBox="0 0 960 960"><path d="M480 864Q401 864 331 834Q261 804 208 752Q156 699 126 629Q96 559 96 480Q96 400 126 330Q157 261 210 208Q264 156 336 126Q407 96 488 96Q566 96 634 123Q703 150 754 197Q805 244 834 307Q864 370 864 442Q864 538 797 605Q730 672 634 672H566Q558 672 552 677Q546 682 546 690Q546 705 561 715Q576 725 576 768Q576 805 549 834Q522 864 480 864ZM264 516Q289 516 306 498Q324 481 324 456Q324 431 306 414Q289 396 264 396Q239 396 222 414Q204 431 204 456Q204 481 222 498Q239 516 264 516ZM384 372Q409 372 426 354Q444 337 444 312Q444 287 426 270Q409 252 384 252Q359 252 342 270Q324 287 324 312Q324 337 342 354Q359 372 384 372ZM576 372Q601 372 618 354Q636 337 636 312Q636 287 618 270Q601 252 576 252Q551 252 534 270Q516 287 516 312Q516 337 534 354Q551 372 576 372ZM696 516Q721 516 738 498Q756 481 756 456Q756 431 738 414Q721 396 696 396Q671 396 654 414Q636 431 636 456Q636 481 654 498Q671 516 696 516ZM480 792Q491 792 498 784Q504 775 504 768Q504 752 489 740Q474 728 474 690Q474 652 500 626Q527 600 565 600H634Q700 600 746 554Q792 508 792 442Q792 327 704 248Q615 168 488 168Q354 168 261 259Q168 350 168 480Q168 610 259 701Q350 792 480 792Z"/></svg>',
      };
      const prevSetup = c.setup_callback;
      c.setup_callback = (ed) => {
        if (ed?.ui?.registry?.addIcon) {
          for (const [k, svg] of Object.entries(gmToxIcons)) {
            ed.ui.registry.addIcon(k, svg);
          }
        }
        if (typeof prevSetup === 'function') prevSetup(ed);
      };
    });

    // mark the Cc/Bcc links as used once their row is visible
    const obs = new MutationObserver(() => {
      for (const name of ['cc', 'bcc']) {
        const row = document.getElementById(`compose_${name}`);
        document
          .querySelector(`.gm-hlink[data-header="${name}"]`)
          ?.classList.toggle('hidden', row && !row.classList.contains('hidden'));
      }
    });
    for (const name of ['cc', 'bcc']) {
      const row = document.getElementById(`compose_${name}`);
      if (row) obs.observe(row, { attributes: true, attributeFilter: ['class'] });
    }
  },
};
