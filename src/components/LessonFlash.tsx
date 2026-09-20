import { KanjiDetail } from "./KanjiDetail";
import { WordRuby } from "./WordRuby";
import { WordAudio } from "./WordAudio";
import { play } from "@/lib/sfx";
import { vocabKana, type Question } from "@/lib/srs";
export function LessonFlash({ lesson, onDismiss }: { lesson: Question; onDismiss: () => void }) {
  return (
        <div className="lesson-backdrop absolute inset-0 z-20 flex items-center justify-center bg-ink/60 px-3 py-4 backdrop-blur-sm sm:p-4">
          <div className="lesson-card flex max-h-full w-full max-w-lg flex-col">
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              <div className="mb-2 text-center font-serif text-lg font-bold text-paper sm:mb-3 sm:text-xl">Lesson flash — 復習</div>
              <div className="lesson-word mb-2 rounded-xl border border-border bg-card p-3 text-center sm:mb-3">
                <WordRuby vocab={lesson.vocab} focus={lesson.kanji.c} className="text-3xl font-bold sm:text-4xl" />
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="font-serif">{vocabKana(lesson.vocab)}</span> · {lesson.vocab.m}
                </div>
                <WordAudio reading={vocabKana(lesson.vocab)} wordKey={lesson} className="mt-2" />
              </div>
              <div className="lesson-detail">
                <KanjiDetail kanji={lesson.kanji} />
              </div>
              <div className="lesson-answer mt-2 rounded-lg bg-card p-2.5 text-center text-sm sm:mt-3 sm:p-3">
                The answer was <b className="ink-reveal font-serif text-lg">{lesson.answer}</b>
              </div>
            </div>
            {/* No data-sfx here: the exhale + root note is played directly so it never doubles with a tap. */}
            <button
              onClick={() => {
                play("keepRunning");
                onDismiss();
                (window as any).__kanjiDashPause?.(false);
              }}
              className="lesson-cta breathe-ring mt-3 min-h-12 w-full shrink-0 rounded-lg bg-primary py-3 font-serif text-lg font-bold text-primary-foreground shadow sm:mt-4"
            >
              Keep running
            </button>
          </div>
        </div>

  );
}
