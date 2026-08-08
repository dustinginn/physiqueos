import { resolveProtocolDoseTransition } from "./ProtocolDoseTransitionService";
import { resolveUserFacingObjectLanguage } from "./UserFacingObjectLanguageService";
import {
  ExecutionPriorityOperationalReason,
  ExecutionPriorityOperationalState,
  findExecutionForProtocol,
  formatExecutionDose,
  formatExecutionSchedule,
  projectExecutionPriority,
} from "./ExecutionPriorityProjectionService";
import {
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../utils/localDate";
import {
  createDexaPriorityId,
  DexaPriorityStage,
  isCurrentScheduledDexaAppointment,
  parseDexaPriorityId,
} from "./DexaAppointmentLifecycleService";
import { formatSupportSchedulePreview } from "../models/SupportScheduleModel";
import {
  MORNING_WEIGH_IN_REMINDER_ID,
  resolveMorningWeighInSupport,
} from "./TrackingSupportService";

const PRIMARY_GOAL_ID = "goal_visible_abs_at_rest";

export function createPriorityDetailService({ repositories, now = () => new Date() }) {
  return {
    async getPriorityDetail(priorityId, userId) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;

      if (!resolvedUserId) return null;

      const [
        goals,
        reminder,
        protocols,
        operatingPlan,
        operatingRhythm,
        executionItems,
      ] =
        await Promise.all([
          repositories.goals.listGoals(resolvedUserId),
          repositories.reminders?.getReminderById(priorityId) ?? null,
          repositories.protocols.listProtocols(resolvedUserId),
          repositories.operatingPlan?.getOperatingPlan(resolvedUserId) ?? null,
          repositories.operatingRhythm?.getOperatingRhythm(resolvedUserId) ?? null,
          repositories.executionItems?.listExecutionItems?.(resolvedUserId) ?? [],
        ]);

      const dexaPriority = parseDexaPriorityId(priorityId);
      if (dexaPriority) {
        const appointment = executionItems.find((item) => item.id === "execution_next_dexa");
        if (isCurrentScheduledDexaAppointment(appointment) &&
            appointment.preferredSchedule?.date === dexaPriority.scheduledDate) {
          return createDexaAppointmentPriorityDetail({
            appointment,
            goals,
            operatingPlan,
            stage: dexaPriority.stage,
          });
        }
        return null;
      }

      if (reminder?.id === MORNING_WEIGH_IN_REMINDER_ID) {
        const support = resolveMorningWeighInSupport({
          executionItems,
          protocols,
          reminders: [reminder],
          userId: resolvedUserId,
        });
        return support
          ? createMorningWeighInPriorityDetail({ goals, operatingPlan, support })
          : null;
      }

      if (["protocol_reminder", "recovery_reminder", "supplement_reminder"].includes(reminder?.type)) {
        const protocol = protocols.find(
          (item) => item.id === reminder.linkedEntityId
        );
        if (
          protocol &&
          ["peptide", "recovery", "supplement"].includes(protocol.category)
        ) {
          const match = findExecutionForProtocol(
            executionItems,
            protocol.id
          );
          const timeZone = resolveLocalTimeZone(
            user?.timeZone ?? user?.timezone
          );
          const currentInstant = now();
          const projection = projectExecutionPriority({
            executionItem: match.executionItem,
            localDate: getLocalDateKey(currentInstant, timeZone),
            now: currentInstant,
            protocol,
            reminder,
            timeZone,
          });

          return protocol.category === "recovery"
            ? createNonDosingSupportPriorityDetail({
                executionItem: match.executionItem,
                goals,
                operatingPlan,
                projection,
                protocol,
              })
            : protocol.category === "supplement"
              ? createSupplementSupportPriorityDetail({
                  executionItem: match.executionItem,
                  goals,
                  operatingPlan,
                  projection,
                  protocol,
                })
              : createExecutionPriorityDetail({
                  executionItem: match.executionItem,
                  goals,
                  operatingPlan,
                  projection,
                  protocol,
                });
        }

        return createLegacyReminderOnlyProtocolPriorityDetail({
          reminder,
          protocol,
          goals,
          operatingPlan,
          operatingRhythm,
          occurrenceDate: dateKey(now()),
        });
      }

      if (reminder?.linkedEvidenceType === "progress_photo") {
        return createProgressPhotoPriorityDetail({
          executionItem: executionItems.find((item) => item.id === "execution_progress_photos"),
          reminder,
          goals,
          operatingPlan,
        });
      }

      if (reminder) {
        return createReminderPriorityDetail({
          reminder,
          goals,
          operatingPlan,
        });
      }

      return createFallbackPriorityDetail(priorityId, goals);
    },
  };
}

function createExecutionPriorityDetail({
  executionItem,
  goals,
  operatingPlan,
  projection,
  protocol,
}) {
  if (!protocol || !projection) return null;
  const actionable =
    projection.operationalState ===
    ExecutionPriorityOperationalState.ACTIONABLE;
  const setupRequired = [
    ExecutionPriorityOperationalState.MISSING_EXECUTION,
    ExecutionPriorityOperationalState.SETUP_REQUIRED,
  ].includes(projection.operationalState);
  const currentDose = formatExecutionDose({
    amount: projection.currentDose,
    unit: projection.doseUnit,
  });
  const nextDose = formatExecutionDose(projection.nextPhase?.dose);
  const phaseLabel = projection.activePhase
    ? `${projection.activePhase.startDate} – ${projection.activePhase.endDate ?? "Until changed"}`
    : "No active phase";
  const setupCopy =
    projection.operationalReason ===
    ExecutionPriorityOperationalReason.MISSING_ACTIVE_PHASE
      ? "Dose schedule needs update"
      : projection.operationalReason ===
          ExecutionPriorityOperationalReason.MISSING_HISTORY_ANCHOR
        ? "Completion setup needs update"
        : "Execution setup required";

  return {
    id: projection.priorityId,
    title: projection.title,
    eyebrow: "Priority Detail",
    subtitle: projection.timeOfDayLabel,
    status: actionable
      ? "Open"
      : setupRequired
        ? "Setup required"
        : "Inactive",
    completable: actionable && projection.completable,
    completionContext:
      actionable && projection.completable
        ? {
            occurrenceDate: projection.localDate,
            dose: currentDose,
            protocolId: projection.protocolRootId,
          }
        : null,
    action: {
      label: setupRequired ? "Review Execution" : "View Execution",
      href: projection.executionHref,
    },
    executionProjection: projection,
    provenance: projection.provenance,
    sections: [
      {
        title: "What",
        items: [
          {
            label: actionable ? projection.title : setupCopy,
            detail: actionable
              ? "Complete the scheduled Execution action."
              : "Review the canonical Execution plan before recording a dose.",
          },
        ],
      },
      {
        title: "When",
        items: [
          {
            label: formatExecutionSchedule(
              executionItem?.preferredSchedule
            ),
            detail: projection.timingContext
              ? projection.timingContext.replaceAll("_", " ")
              : "Timing comes from the canonical Execution plan.",
          },
        ],
      },
      {
        title: "Dose",
        items: [
          {
            label: currentDose ?? "No dose scheduled",
            detail: phaseLabel,
          },
        ],
      },
      {
        title: "Preparation",
        items: getExecutionPreparationItems(executionItem),
      },
      ...getExecutionNotesSections(executionItem),
      {
        title: "Why it matters",
        items: [
          {
            label: "Supports the current operating plan",
            detail:
              protocol.purpose ??
              "This Execution action supports the current operating plan.",
          },
        ],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol, goals, operatingPlan }),
      },
      {
        title: "Next Execution Change",
        items: [
          {
            label: nextDose ?? "None scheduled",
            detail: projection.nextPhase
              ? `Begins ${formatDate(projection.nextPhase.startDate)}.`
              : "No upcoming Execution phase is scheduled.",
          },
        ],
      },
      ...(actionable
        ? [
            {
              title: "Completion",
              items: [
                {
                  label: "Mark Complete",
                  detail:
                    "Completion is recorded against the existing reminder history anchor.",
                },
              ],
            },
          ]
        : []),
    ],
  };
}

function createNonDosingSupportPriorityDetail({
  executionItem,
  goals,
  operatingPlan,
  projection,
  protocol,
}) {
  if (!protocol || !projection) return null;
  const actionable =
    projection.operationalState === ExecutionPriorityOperationalState.ACTIONABLE;
  const setupRequired = [
    ExecutionPriorityOperationalState.MISSING_EXECUTION,
    ExecutionPriorityOperationalState.SETUP_REQUIRED,
  ].includes(projection.operationalState);

  return {
    id: projection.priorityId,
    title: projection.title,
    eyebrow: "Priority Detail",
    subtitle: projection.timeOfDayLabel,
    status: actionable ? "Open" : setupRequired ? "Setup required" : "Inactive",
    completable: actionable && projection.completable,
    completionContext:
      actionable && projection.completable
        ? {
            occurrenceDate: projection.localDate,
            dose: null,
            protocolId: projection.protocolRootId,
          }
        : null,
    action: {
      label: setupRequired ? "Review Support" : "View Support",
      href: projection.executionHref,
    },
    executionProjection: projection,
    provenance: projection.provenance,
    sections: [
      {
        title: "What",
        items: [{
          label: actionable ? projection.title : "Support setup required",
          detail: actionable
            ? "Complete the scheduled recovery support."
            : "Review the saved Support schedule before recording completion.",
        }],
      },
      {
        title: "When",
        items: [{
          label: formatExecutionSchedule({
            ...executionItem?.preferredSchedule,
            cadence: executionItem?.cadence?.type,
          }),
          detail: "Timing comes from the saved Support schedule.",
        }],
      },
      ...getExecutionNotesSections(executionItem),
      {
        title: "Why it matters",
        items: [{
          label: "Supports the current recovery strategy",
          detail:
            protocol.purpose ??
            "This recovery method supports training readiness and consistency.",
        }],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol, goals, operatingPlan }),
      },
      ...(actionable
        ? [{
            title: "Completion",
            items: [{
              label: "Mark Complete",
              detail: "Completion remains recorded against the existing reminder history.",
            }],
          }]
        : []),
    ],
  };
}

function createSupplementSupportPriorityDetail({
  executionItem,
  goals,
  operatingPlan,
  projection,
  protocol,
}) {
  if (!protocol || !projection) return null;
  const actionable =
    projection.operationalState === ExecutionPriorityOperationalState.ACTIONABLE;
  const setupRequired = [
    ExecutionPriorityOperationalState.MISSING_EXECUTION,
    ExecutionPriorityOperationalState.SETUP_REQUIRED,
  ].includes(projection.operationalState);
  const dose = formatExecutionDose({
    amount: projection.currentDose,
    unit: projection.doseUnit,
  });

  return {
    id: projection.priorityId,
    title: projection.title,
    eyebrow: "Priority Detail",
    subtitle: projection.timeOfDayLabel,
    status: actionable ? "Open" : setupRequired ? "Setup required" : "Inactive",
    completable: actionable && projection.completable,
    completionContext:
      actionable && projection.completable
        ? {
            occurrenceDate: projection.localDate,
            dose,
            protocolId: projection.protocolRootId,
          }
        : null,
    action: {
      label: setupRequired ? "Review Support" : "View Support",
      href: projection.executionHref,
    },
    executionProjection: projection,
    provenance: projection.provenance,
    sections: [
      {
        title: "What",
        items: [{
          label: actionable ? projection.title : "Support setup required",
          detail: actionable
            ? "Complete the scheduled supplement support."
            : "Review the saved Support schedule before recording completion.",
        }],
      },
      {
        title: "When",
        items: [{
          label: formatExecutionSchedule({
            ...executionItem?.preferredSchedule,
            cadence: executionItem?.cadence?.type,
            interval: executionItem?.cadence?.interval,
          }),
          detail: "Timing comes from the saved Support schedule.",
        }],
      },
      {
        title: "Dose / Quantity",
        items: [{
          label: dose ?? "Not specified",
          detail: dose
            ? "Uses the quantity saved with this Support method."
            : "No quantity is currently configured.",
        }],
      },
      ...getExecutionNotesSections(executionItem),
      {
        title: "Why it matters",
        items: [{
          label: "Supports the current supplement strategy",
          detail:
            protocol.purpose ??
            "This supplement supports the current strategy.",
        }],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol, goals, operatingPlan }),
      },
      ...(actionable
        ? [{
            title: "Completion",
            items: [{
              label: "Mark Complete",
              detail: "Completion is recorded against the canonical Support reminder.",
            }],
          }]
        : []),
    ],
  };
}

function getExecutionNotesSections(executionItem) {
  return executionItem?.notes
    ? [{
        title: "Execution Notes",
        items: [{
          label: "Saved Support note",
          detail: executionItem.notes,
        }],
      }]
    : [];
}

function createMorningWeighInPriorityDetail({ goals, operatingPlan, support }) {
  return {
    id: support.reminder.id,
    title: "Morning Weigh-In",
    eyebrow: "Priority Detail",
    subtitle: support.supportSummary,
    status: support.reminder.active ? "Open" : "Reminder off",
    completable: false,
    action: { label: "Log Weight", href: "/check-in/morning" },
    sections: [
      {
        title: "What",
        items: [{
          label: "Record your weight",
          detail: "A valid weight recorded for today satisfies this routine automatically.",
        }],
      },
      {
        title: "When",
        items: [{
          label: formatSupportSchedulePreview(support.supportSchedule),
          detail: "Timing comes from the saved Support schedule.",
        }],
      },
      ...getExecutionNotesSections(support.executionItem),
      {
        title: "Why it matters",
        items: [{
          label: "Track the body-weight trend",
          detail: "This evidence helps PI evaluate progress and energy strategy against the current goal.",
        }],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol: support.protocol, goals, operatingPlan }),
      },
      {
        title: "Completion",
        items: [{
          label: "Evidence-driven",
          detail: "No separate completion is needed after today's valid weight is recorded.",
        }],
      },
    ],
  };
}

// Reminder-only protocols retain their existing detail until they gain a
// canonical Execution record. Peptides and supplements never enter this path.
function createLegacyReminderOnlyProtocolPriorityDetail({
  reminder,
  protocol,
  goals,
  operatingPlan,
  operatingRhythm,
  occurrenceDate,
}) {
  if (!protocol) return null;

  const transition = resolveProtocolDoseTransition(protocol, occurrenceDate);
  const currentDose = formatDose(transition.effectiveDose);
  const currentWeek = getCurrentProtocolWeek(protocol);
  const nextDoseChange = transition.nextDose
    ? {
        label: formatDose(transition.nextDose),
        detail: `Planned for ${formatDate(transition.nextEffectiveDate)}.`,
      }
    : null;

  return {
    id: reminder.id,
    title: protocol.name,
    eyebrow: "Priority Detail",
    subtitle: reminder.schedule?.timeOfDay === "night" ? "Tonight" : "Today",
    status: "Open",
    completable: true,
    completionContext: {
      occurrenceDate,
      dose: currentDose,
      protocolId: protocol.id,
    },
    action: {
      label: "Continue",
      href: "/",
    },
    sections: [
      {
        title: "What",
        items: [
          {
            label: protocol.name,
            detail: "Complete the scheduled protocol action.",
          },
        ],
      },
      {
        title: "When",
        items: [
          {
            label: formatSchedule(reminder.schedule),
            detail: formatRhythmContext(protocol, operatingRhythm),
          },
        ],
      },
      {
        title: "Dose",
        items: [
          {
            label: currentDose ?? "Dose pending",
            detail: transition.changeEffectiveToday
              ? `Effective today. Previously ${formatDose(transition.previousDose)}.`
              : currentWeek ? `Current protocol week: ${currentWeek}` : "Week pending",
          },
        ],
      },
      {
        title: "Preparation",
        items: getPreparationItems(protocol),
      },
      {
        title: "Why it matters",
        items: [
          {
            label: "Supports the current operating plan",
            detail:
              "Supports the current operating plan and maintenance calibration while tapering appetite support after the cut.",
          },
        ],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol, goals, operatingPlan }),
      },
      {
        title: "Next Protocol Change",
        items: [
          {
            label: nextDoseChange?.label ?? "Continue current dose",
            detail: nextDoseChange?.detail ?? "No upcoming dose change is due today.",
          },
        ],
      },
      {
        title: "Completion",
        items: [
          {
            label: "Mark Complete",
            detail:
              "Completion tracking will be saved through the reminder repository in the next interaction pass.",
          },
        ],
      },
    ],
  };
}

function createProgressPhotoPriorityDetail({ executionItem, reminder, goals, operatingPlan }) {
  return {
    id: reminder.id,
    title: reminder.title,
    eyebrow: "Priority Detail",
    subtitle: formatProgressPhotoScheduleSubtitle(reminder.schedule),
    status: "Open",
    completable: false,
    action: {
      label: "Upload Photos",
      href: "/evidence/photos",
    },
    sections: [
      {
        title: "What",
        items: [
          {
            label: reminder.title,
            detail: `Upload ${formatExpectedViews(reminder.expectedViews)} to complete today's check-in.`,
          },
        ],
      },
      {
        title: "When",
        items: [
          {
            label: formatSchedule(reminder.schedule),
            detail: "This occurrence follows your saved Progress Photos schedule.",
          },
        ],
      },
      ...getExecutionNotesSections(executionItem),
      {
        title: "Why it matters",
        items: [
          {
            label: "Visual calibration",
            detail:
              "Progress photos support qualitative goals like Visible Abs at Rest without replacing DEXA or weight evidence.",
          },
        ],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol: reminder, goals, operatingPlan }),
      },
      {
        title: "Completion",
        items: [
          {
            label: "Upload photos",
            detail:
              "Confirmed photo evidence satisfies the matching scheduled occurrence.",
          },
        ],
      },
    ],
  };
}

function createDexaAppointmentPriorityDetail({ appointment, goals, operatingPlan, stage }) {
  const upload = stage === DexaPriorityStage.UPLOAD_RESULTS;
  const preparationNote = String(appointment.preparationNote ?? "").trim();
  const date = formatDexaDate(appointment.preferredSchedule.date);
  const time = formatTimeOfDay(appointment.preferredSchedule.timeOfDay);
  const title = getDexaPriorityTitle(stage);

  return {
    id: createDexaPriorityId(appointment.preferredSchedule.date, stage),
    title,
    eyebrow: "Priority Detail",
    subtitle: getDexaPrioritySubtitle(stage, time),
    status: upload ? "Action needed" : "Upcoming",
    completable: false,
    action: {
      label: upload ? "Upload DEXA Results" : "View DEXA Appointment",
      href: upload ? "/evidence/dexa" : "/profile/operating-plan/execution/dexa",
    },
    sections: [
      {
        title: "What",
        items: [{
          label: title,
          detail: upload
            ? "The scheduled scan time has passed. Upload the results so the appointment can be reconciled with confirmed evidence."
            : "Your DEXA appointment remains scheduled. This priority does not complete the scan itself.",
        }],
      },
      {
        title: "When",
        items: [{
          label: [date, time].filter(Boolean).join(" · "),
          detail: `Timing uses ${appointment.timezone ?? "your local timezone"}.`,
        }],
      },
      ...(!upload && preparationNote
        ? [{
            title: "Preparation",
            items: [{ label: "Saved preparation note", detail: preparationNote }],
          }]
        : []),
      {
        title: "Why it matters",
        items: [{
          label: "Body-composition calibration",
          detail: "Confirmed DEXA evidence updates the body-composition record supporting your current strategy.",
        }],
      },
      {
        title: upload ? "Completion" : "Appointment completion",
        items: [{
          label: upload ? "Upload confirmed results" : "Evidence completes this appointment",
          detail: "Matching confirmed DEXA evidence completes the scheduled appointment and suppresses its remaining priorities.",
        }],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol: {
          currentGoalIds: appointment.linkedGoalIds,
          relatedGoalIds: appointment.linkedGoalIds,
        }, goals, operatingPlan }),
      },
    ].filter((section) => section.items.length > 0),
  };
}

function getDexaPriorityTitle(stage) {
  if (stage === DexaPriorityStage.WEEK_BEFORE) return "DEXA in 1 week";
  if (stage === DexaPriorityStage.DAY_BEFORE) return "DEXA tomorrow";
  if (stage === DexaPriorityStage.MORNING_OF) return "DEXA this morning";
  if (stage === DexaPriorityStage.APPOINTMENT) return "DEXA appointment";
  return "Upload DEXA results";
}

function getDexaPrioritySubtitle(stage, time) {
  if (stage === DexaPriorityStage.WEEK_BEFORE) return "Upcoming appointment";
  if (stage === DexaPriorityStage.DAY_BEFORE) return time ? `Tomorrow at ${time}` : "Tomorrow";
  if (stage === DexaPriorityStage.MORNING_OF) return time ? `Today at ${time}` : "This morning";
  if (stage === DexaPriorityStage.APPOINTMENT) return time ? `Today at ${time}` : "Today";
  return "Results are ready to upload";
}

function formatDexaDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatProgressPhotoScheduleSubtitle(schedule = {}) {
  const timeOfDay = String(schedule.timeOfDay ?? "").toLowerCase();
  if (["morning", "afternoon", "evening"].includes(timeOfDay)) {
    return `Scheduled for this ${timeOfDay}.`;
  }
  if (timeOfDay === "night") return "Scheduled for tonight.";
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay)) {
    return `Scheduled for ${formatTimeOfDay(timeOfDay)}.`;
  }
  return "Scheduled for today.";
}

function createReminderPriorityDetail({ reminder, goals, operatingPlan }) {
  return {
    id: reminder.id,
    title: reminder.title,
    eyebrow: "Priority Detail",
    subtitle: formatSchedule(reminder.schedule),
    status: "Open",
    completable: true,
    action: {
      label: "Continue",
      href: "/",
    },
    sections: [
      {
        title: "What",
        items: [
          {
            label: reminder.title,
            detail: reminder.notes || "Complete this scheduled priority.",
          },
        ],
      },
      {
        title: "When",
        items: [
          {
            label: formatSchedule(reminder.schedule),
            detail:
              reminder.persistenceMode === "always_visible"
                ? "Always visible until completed by founder preference."
                : "Scheduled by the operating plan.",
          },
        ],
      },
      {
        title: "Adaptive Assistance",
        items: [
          {
            label: formatPersistenceMode(reminder.persistenceMode),
            detail: getAdaptiveAssistanceDetail(reminder),
          },
        ],
      },
      {
        title: "Related Goals",
        items: getRelatedGoalItems({ protocol: reminder, goals, operatingPlan }),
      },
    ],
  };
}

function createFallbackPriorityDetail(priorityId, goals) {
  const primaryGoal = goals.find((goal) => goal.id === PRIMARY_GOAL_ID);

  return {
    id: priorityId,
    title: "Priority",
    eyebrow: "Priority Detail",
    subtitle: "Operational context",
    status: "Open",
    action: {
      label: "Continue",
      href: "/",
    },
    sections: [
      {
        title: "Why it matters",
        items: [
          {
            label: "Supports the current goal",
            detail: primaryGoal
              ? `This priority supports ${resolveUserFacingObjectLanguage({
                  objectType: "goal",
                  canonicalId: primaryGoal.id,
                  displayName: primaryGoal.title,
                  specificity: "specific",
                  narrativeContext: "priority_coaching",
                }).selectedReference}.`
              : "This priority supports the active operating plan.",
          },
        ],
      },
    ],
  };
}

function getExecutionPreparationItems(executionItem) {
  if (executionItem?.timingContext === "fasted_before_bed") {
    return [
      {
        label: "Finish eating approximately 2–3 hours before injection",
        detail: "Preserve the normal fasted-before-bed timing window.",
      },
      {
        label: "Take fasted before bed",
        detail: executionItem.notes || "Use the saved Execution conditions.",
      },
    ];
  }

  return [
    {
      label: "Use the saved Execution conditions",
      detail:
        executionItem?.notes ||
        "Preparation details are owned by the canonical Execution plan.",
    },
  ];
}

function getPreparationItems(protocol) {
  if (protocol.schedule?.timingContext === "fasted_before_bed") {
    return [
      {
        label: "Finish eating approximately 2–3 hours before injection",
        detail: "Preserve the normal fasted-before-bed timing window.",
      },
      {
        label: "Take fasted before bed",
        detail: "Use the founder's default nighttime protocol conditions.",
      },
    ];
  }

  return [
    {
      label: "Use normal protocol conditions",
      detail: protocol.notes,
    },
  ];
}

function getRelatedGoalItems({ protocol, goals, operatingPlan }) {
  const currentGoalIds = protocol.currentGoalIds ?? [];
  const primaryGoal =
    goals.find((goal) => currentGoalIds.includes(goal.id) && goal.status !== "completed") ??
    goals.find((goal) => goal.id === operatingPlan?.primaryGoalId && goal.status !== "completed");
  const relatedGoals = goals.filter((goal) =>
    protocol.relatedGoalIds?.includes(goal.id)
  );
  const guardrails = relatedGoals.filter(
    (goal) => goal.id !== primaryGoal?.id && /8[-–]9%|guardrail/i.test(`${goal.title} ${goal.type}`)
  );
  const items = [];

  if (primaryGoal) {
    items.push({
      label: "Primary Goal",
      detail: formatGoalTitle(primaryGoal.title),
    });
  }

  if (guardrails.length > 0) {
    items.push({
      label: "Guardrail",
      detail: guardrails.map((goal) => formatGoalTitle(goal.title)).join(", "),
    });
  }

  return items;
}

function getCurrentProtocolWeek(protocol, now = new Date()) {
  if (!protocol.startDate) return null;

  const start = new Date(`${protocol.startDate}T12:00:00`);
  const elapsedDays = Math.max(0, Math.floor((now - start) / 86400000));

  return Math.floor(elapsedDays / 7) + 1;
}

function getNextDoseChange(protocol, now = new Date()) {
  const today = dateKey(now);
  const next = (protocol.doseHistory ?? [])
    .filter((entry) => entry.status === "planned" && entry.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  if (!next) return null;

  return {
    label: `${next.dose} ${next.doseUnit}`,
    detail: `Planned for ${formatDate(next.startDate)}.`,
  };
}

function formatDose(dose) {
  if (!dose?.value || !dose?.unit) return null;

  return `${dose.value} ${dose.unit}`;
}

function formatSchedule(schedule) {
  const time = schedule?.timeOfDay ? formatTimeOfDay(schedule.timeOfDay) : "Today";
  const day = schedule?.dayOfWeek
    ? capitalize(schedule.dayOfWeek)
    : schedule?.daysOfWeek?.length
      ? schedule.daysOfWeek.map(capitalize).join(", ")
      : null;

  return day ? `${day} ${time}` : time;
}

function formatPersistenceMode(value) {
  if (!value) return "Scheduled";

  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

function getAdaptiveAssistanceDetail(reminder) {
  if (reminder.persistenceMode === "always_visible") {
    return "PhysiqueOS will not recommend removing this priority unless the founder changes preference.";
  }

  if (reminder.adaptiveAssistance?.eligible) {
    return "PhysiqueOS may recommend reducing reminder friction after consistent completion, but the founder decides.";
  }

  return "No adaptive reduction is currently enabled.";
}

function formatTimeOfDay(value) {
  if (value === "morning" || value === "night") return capitalize(value);

  const [hourText, minuteText] = String(value).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);

  if (!Number.isFinite(hour)) return value;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatRhythmContext(protocol, operatingRhythm) {
  const rhythm = operatingRhythm?.protocolTiming?.find(
    (item) => item.protocolId === protocol.id
  );

  return rhythm
    ? rhythm.timing.replaceAll("_", " ")
    : protocol.schedule?.timingContext?.replaceAll("_", " ") ?? protocol.notes;
}

function formatExpectedViews(expectedViews = []) {
  if (expectedViews.length === 0) return "the expected views";
  if (expectedViews.length === 1) return expectedViews[0].replaceAll("-", " ");

  return expectedViews.map((view) => view.replaceAll("-", " ")).join(", ");
}

function formatGoalTitle(title) {
  return title
    .replace("Visible abs at rest", "Visible Abs")
    .replace("Preserve lean mass", "Lean Mass Preservation")
    .replace("Maintain 8-9% body fat", "8-9% Body Fat");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function dateKey(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
