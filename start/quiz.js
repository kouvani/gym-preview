/*
  The 1-minute quiz. Four questions, one per screen, then the plan it picks and one link
  into the app with the answers in ?q= (format in README.md). No build step, no libraries.
*/
(function () {
  'use strict';

  /** Where "Open my plan" goes. The answers ride along as ?q=... */
  var APP_URL = 'https://kouvani.github.io/gym-preview/';

  /* ---- Tracking hooks ---------------------------------------------------
     Both fire at most once per page view. They only log for now.
     META PIXEL: once the pixel base code is in index.html, add the fbq calls marked below. */

  function quizStarted() {
    // META PIXEL: fbq('trackCustom', 'QuizStarted');
    console.debug('[quiz] started');
  }

  function quizCompleted(answers, planId) {
    // META PIXEL: fbq('trackCustom', 'QuizCompleted', { plan: planId });
    console.debug('[quiz] completed', planId, answers);
  }

  /* ---- Content ----------------------------------------------------------
     Values match the app's own answer values (packages/domain/src/types.ts). */

  var QUESTIONS = [
    {
      key: 'where',
      title: 'Where will you train?',
      sub: 'Your plan uses whatever you have.',
      options: [
        { value: 'gym', label: 'Gym', desc: 'I can use machines and weights' },
        { value: 'dumbbells', label: 'Dumbbells at home', desc: 'A pair or two of dumbbells' },
        { value: 'bodyweight', label: 'No equipment', desc: 'Just me and a bit of floor space' }
      ]
    },
    {
      key: 'exp',
      title: 'How much strength training have you done?',
      sub: 'Any answer is fine. It just sets your starting point.',
      options: [
        { value: 'new', label: 'New to this', desc: "I'm just getting started" },
        { value: 'returning', label: 'Back after a break', desc: "I've trained before, but not lately" },
        { value: 'regular', label: 'Lifting regularly', desc: 'I train with weights most weeks' }
      ]
    },
    {
      key: 'days',
      title: 'How many days a week would you like to train?',
      sub: 'Rest days matter too. Pick what feels doable.',
      options: [
        { value: 2, label: '2 days', desc: 'A gentle rhythm' },
        { value: 3, label: '3 days', desc: 'A steady routine' },
        { value: 4, label: '4 days', desc: 'More time for strength' }
      ]
    },
    {
      key: 'easy',
      multi: true,
      title: "Anything you'd like to go easy on?",
      sub: "We'll start those movements more gently. Pick as many as you like.",
      options: [
        { value: 'knees', label: 'Knees' },
        { value: 'back', label: 'Back' },
        { value: 'shoulders', label: 'Shoulders' },
        { value: 'hips', label: 'Hips' },
        { value: 'none', label: 'None' }
      ]
    }
  ];

  /* Same names and lines as the app (packages/content/src/plans.ts). */
  var PLANS = {
    start_strong: {
      name: 'Start Strong',
      blurb: 'Gentle full-body sessions with a warm-up built in. Settle in at your own pace.'
    },
    build_strength: {
      name: 'Build Strength',
      blurb: 'Focused sessions to help you get a little stronger, one step at a time.'
    },
    home_strong: {
      name: 'Home Strong',
      blurb: 'Simple sessions you can do at home, with easier options whenever you want them.'
    },
    build_strength_home: {
      name: 'Build Strength at Home',
      blurb: 'Focused dumbbell sessions at home to help you get a little stronger, one step at a time.'
    }
  };

  var WHERE_LABELS = { gym: 'Gym', dumbbells: 'Dumbbells at home', bodyweight: 'No equipment' };
  var AREA_LABELS = { knees: 'Knees', back: 'Back', shoulders: 'Shoulders', hips: 'Hips' };

  /**
   * Mirrors routeOnboarding() in packages/domain/src/onboarding.ts:
   * - lifting regularly + dumbbells + 3-4 days -> Build Strength at Home
   * - any other dumbbell or no-equipment answer -> Home Strong
   * - lifting regularly + gym + 3-4 days -> Build Strength
   * - everyone else -> Start Strong (a 2-3 day plan, so 4 days becomes 3)
   */
  function routePlan(a) {
    var days = a.days || 3;
    var regularThreePlus = a.exp === 'regular' && (days === 3 || days === 4);
    if (a.where === 'dumbbells' && regularThreePlus) return { id: 'build_strength_home', days: days };
    if (a.where === 'dumbbells' || a.where === 'bodyweight') return { id: 'home_strong', days: days };
    if (regularThreePlus) return { id: 'build_strength', days: days };
    return { id: 'start_strong', days: days === 4 ? 3 : days };
  }

  /** v=1&where=dumbbells&exp=returning&days=3&easy=knees,back (all values are [a-z0-9]). */
  function encodeAnswers(a) {
    return [
      'v=1',
      'where=' + a.where,
      'exp=' + a.exp,
      'days=' + a.days,
      'easy=' + (a.easy.length ? a.easy.join(',') : 'none')
    ].join('&');
  }

  function planLink(a) {
    return APP_URL + '?q=' + encodeURIComponent(encodeAnswers(a));
  }

  /* ---- Quiz ------------------------------------------------------------ */

  var dialog = document.getElementById('quiz');
  if (!dialog || typeof dialog.showModal !== 'function') return; // buttons fall back to opening the app

  var stage = dialog.querySelector('.quiz-stage');
  var backBtn = dialog.querySelector('[data-quiz-back]');
  var closeBtn = dialog.querySelector('[data-quiz-close]');
  var track = dialog.querySelector('.progress-track');
  var fill = dialog.querySelector('.progress-fill');
  var progressText = dialog.querySelector('.progress-text');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var answers = { where: null, exp: null, days: null, easy: [] };
  var step = 0; // 0-3 = questions, 4 = result
  var busy = false;
  var closedByBack = false; // the back gesture already removed the quiz entry
  var ignoreNextPop = false; // our own history.back() after closing
  var started = false;
  var completed = false;

  var TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function heading(text) {
    var h = el('h2', 'q-title', text);
    h.tabIndex = -1;
    return h;
  }

  function answerButton(opt, pressed) {
    var b = el('button', 'answer');
    b.type = 'button';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.dataset.value = String(opt.value);
    var text = el('span', 'answer-text');
    text.appendChild(el('span', 'answer-label', opt.label));
    if (opt.desc) text.appendChild(el('span', 'answer-desc', opt.desc));
    b.appendChild(text);
    var mark = el('span', 'mark');
    mark.innerHTML = TICK;
    b.appendChild(mark);
    return b;
  }

  function buildQuestion(i) {
    var q = QUESTIONS[i];
    var screen = el('section', 'q-screen');
    screen.appendChild(heading(q.title));
    screen.appendChild(el('p', 'q-sub', q.sub));

    var list = el('div', q.multi ? 'answers tiles' : 'answers');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', q.title);
    screen.appendChild(list);

    if (!q.multi) {
      q.options.forEach(function (opt) {
        var b = answerButton(opt, answers[q.key] === opt.value);
        b.addEventListener('click', function () {
          if (busy) return;
          answers[q.key] = opt.value;
          list.querySelectorAll('.answer').forEach(function (other) {
            other.setAttribute('aria-pressed', other === b ? 'true' : 'false');
          });
          busy = true;
          // A short pause so the choice is seen before the next question slides in.
          setTimeout(function () { busy = false; go(i + 1, 1); }, reduceMotion.matches ? 120 : 240);
        });
        list.appendChild(b);
      });
      return screen;
    }

    // Pick-many: "None" is selected while nothing else is, as in the app.
    function sync() {
      list.querySelectorAll('.answer').forEach(function (b) {
        var v = b.dataset.value;
        var on = v === 'none' ? answers.easy.length === 0 : answers.easy.indexOf(v) !== -1;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    q.options.forEach(function (opt) {
      var b = answerButton(opt, false);
      b.addEventListener('click', function () {
        if (opt.value === 'none') {
          answers.easy = [];
        } else {
          var at = answers.easy.indexOf(opt.value);
          if (at === -1) answers.easy.push(opt.value);
          else answers.easy.splice(at, 1);
          // Keep the app's order so the link is stable.
          answers.easy = q.options
            .map(function (o) { return o.value; })
            .filter(function (v) { return answers.easy.indexOf(v) !== -1; });
        }
        sync();
      });
      list.appendChild(b);
    });
    sync();

    var actions = el('div', 'q-actions');
    var next = el('button', 'btn btn-primary', 'See my plan');
    next.type = 'button';
    next.addEventListener('click', function () { if (!busy) go(i + 1, 1); });
    actions.appendChild(next);
    screen.appendChild(actions);
    return screen;
  }

  function easyText(list) {
    if (!list.length) return 'Nothing in particular';
    var names = list.map(function (v) { return AREA_LABELS[v].toLowerCase(); });
    var text = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function buildResult() {
    var route = routePlan(answers);
    var plan = PLANS[route.id];
    var screen = el('section', 'q-screen result');
    screen.appendChild(heading('Your plan is ready'));

    var box = el('div', 'result-plan');
    box.appendChild(el('p', 'result-name', plan.name));
    box.appendChild(el('p', 'result-blurb', plan.blurb));
    screen.appendChild(box);

    var dl = el('dl', 'result-summary');
    var rows = [
      ['Where', WHERE_LABELS[answers.where]],
      ['Days', route.days + ' a week' + (route.days !== answers.days ? ' to start' : '')],
      ['Going easy on', easyText(answers.easy)]
    ];
    rows.forEach(function (r) {
      var row = el('div');
      row.appendChild(el('dt', null, r[0]));
      row.appendChild(el('dd', null, r[1]));
      dl.appendChild(row);
    });
    screen.appendChild(dl);

    var actions = el('div', 'q-actions');
    var open = el('a', 'btn btn-primary', 'Open my plan');
    open.href = planLink(answers);
    actions.appendChild(open);
    actions.appendChild(el('p', 'result-next', 'Next: a few quick settings in the app, then your first workout.'));
    screen.appendChild(actions);

    if (!completed) {
      completed = true;
      quizCompleted({ where: answers.where, exp: answers.exp, days: answers.days, easy: answers.easy.slice() }, route.id);
    }
    return screen;
  }

  function setProgress(i) {
    var total = QUESTIONS.length;
    var shown = Math.min(i + 1, total);
    // The result screen is the last step, so question 4 of 4 isn't already a full bar.
    fill.style.width = ((Math.min(i, total) + 1) / (total + 1)) * 100 + '%';
    track.setAttribute('aria-valuenow', String(i >= total ? total : shown));
    progressText.textContent = i >= total ? 'All done' : shown + ' of ' + total;
    backBtn.hidden = i === 0;
  }

  /** Show screen i. dir 1 = forward, -1 = back, 0 = no slide (first open). */
  function go(i, dir) {
    step = i;
    setProgress(i);
    var next = i < QUESTIONS.length ? buildQuestion(i) : buildResult();
    var old = stage.querySelector('.q-screen:not(.leaving)');
    var title = next.querySelector('.q-title');

    if (old) {
      var oldTitle = old.querySelector('.q-title');
      if (oldTitle) oldTitle.removeAttribute('id');
    }
    title.id = 'quiz-heading';
    stage.appendChild(next);
    dialog.scrollTop = 0;

    var animate = old && dir !== 0 && !reduceMotion.matches && typeof next.animate === 'function';
    if (animate) {
      old.classList.add('leaving');
      var out = old.animate(
        [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(' + (-28 * dir) + 'px)' }],
        { duration: 180, easing: 'ease-in', fill: 'forwards' }
      );
      out.onfinish = function () { old.remove(); };
      next.animate(
        [{ opacity: 0, transform: 'translateX(' + (36 * dir) + 'px)' }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 300, delay: 60, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' }
      );
    } else if (old) {
      old.remove();
    }
    title.focus({ preventScroll: true });
  }

  function back() {
    if (step > 0 && !busy) go(step - 1, -1);
  }

  /* Opening pushes one history entry, so the phone's back gesture steps back through the
     questions and, from the first one, closes the quiz instead of leaving the page. */
  function openQuiz(e) {
    if (e) e.preventDefault();
    if (dialog.open) return;
    if (!started) { started = true; quizStarted(); }
    stage.textContent = '';
    answers = { where: null, exp: null, days: null, easy: [] };
    document.documentElement.classList.add('quiz-open');
    dialog.showModal();
    if (!reduceMotion.matches && typeof dialog.animate === 'function') {
      dialog.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    }
    go(0, 0);
    history.pushState({ quiz: true }, '', '#quiz');
  }

  function closeQuiz() {
    if (dialog.open) dialog.close();
  }

  // However the dialog closes (button, Esc, back gesture), tidy up and drop the quiz entry.
  dialog.addEventListener('close', function () {
    document.documentElement.classList.remove('quiz-open');
    if (!closedByBack && history.state && history.state.quiz) {
      ignoreNextPop = true;
      history.back();
    }
    closedByBack = false;
  });

  window.addEventListener('popstate', function () {
    if (ignoreNextPop) { ignoreNextPop = false; return; }
    if (!dialog.open) return;
    if (step === 0) {
      closedByBack = true;
      closeQuiz();
      return;
    }
    // Back gesture mid-quiz: go back one question and keep the quiz entry.
    back();
    history.pushState({ quiz: true }, '', '#quiz');
  });

  dialog.addEventListener('cancel', function (e) {
    e.preventDefault(); // Esc: close through the same path as the close button
    closeQuiz();
  });

  backBtn.addEventListener('click', back);
  closeBtn.addEventListener('click', closeQuiz);
  document.querySelectorAll('[data-quiz-open]').forEach(function (a) {
    a.addEventListener('click', openQuiz);
  });

  // A reload while the quiz was open leaves #quiz in the address; drop it.
  if (location.hash === '#quiz') {
    history.replaceState(null, '', location.pathname + location.search);
  }
})();
