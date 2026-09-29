import XCTest
@testable import PhysiqueOS

/// The peptide screen's single action surface (design §3, S2, S3): every
/// write goes out in the Server's own vocabulary, re-reads afterwards, and
/// surfaces the Server's refusals in the copy the iOS-product lens fixed.
@MainActor
final class PeptideSupportEditorViewModelTests: XCTestCase {
    // MARK: - Stubs

    private final class StubSupportAPI: PeptideSupportAPI, @unchecked Sendable {
        struct SaveCall: Equatable {
            var protocolId: String
            var expectedRevision: Int?
            var supportSchedule: OperatingPlanSupportScheduleReadModel
            var dosing: PeptideDosingStrategyReadModel
            var timingContext: String
            var reminderPreference: OperatingPlanReminderPreference
            var notes: String
            var rewriteHistory: Bool
        }

        /// Consumed front to back; the last element repeats.
        var fetchQueue: [PeptideSupportDetail?]
        var fetchCount = 0
        var saves: [SaveCall] = []
        var saveResult: Result<PeptideSupportSaveResult, Error>

        init(fetchQueue: [PeptideSupportDetail?], saveResult: Result<PeptideSupportSaveResult, Error> = .success(.init(status: "updated", protocolId: "peptide-protocol", executionId: "execution-peptide", executionRevision: 4))) {
            self.fetchQueue = fetchQueue
            self.saveResult = saveResult
        }

        func fetchSupport(protocolId: String) async throws -> PeptideSupportDetail? {
            fetchCount += 1
            if fetchQueue.count > 1 { return fetchQueue.removeFirst() }
            return fetchQueue.first ?? nil
        }

        func save(
            protocolId: String,
            expectedRevision: Int?,
            supportSchedule: OperatingPlanSupportScheduleReadModel,
            dosing: PeptideDosingStrategyReadModel,
            timingContext: String,
            reminderPreference: OperatingPlanReminderPreference,
            notes: String,
            rewriteHistory: Bool
        ) async throws -> PeptideSupportSaveResult {
            saves.append(.init(
                protocolId: protocolId, expectedRevision: expectedRevision, supportSchedule: supportSchedule,
                dosing: dosing, timingContext: timingContext, reminderPreference: reminderPreference,
                notes: notes, rewriteHistory: rewriteHistory
            ))
            return try saveResult.get()
        }
    }

    private final class StubLifecycleAPI: PeptideLifecycleAPI, @unchecked Sendable {
        struct PauseCall: Equatable { var protocolId: String; var expectedRevision: Int; var effectiveDate: PeptideLifecycleEffectiveDate }
        struct ResumeCall: Equatable { var protocolId: String; var expectedRevision: Int }
        var pauses: [PauseCall] = []
        var resumes: [ResumeCall] = []
        var error: Error?

        func pause(protocolId: String, expectedRevision: Int, effectiveDate: PeptideLifecycleEffectiveDate) async throws -> PeptideLifecycleChangeResult {
            pauses.append(.init(protocolId: protocolId, expectedRevision: expectedRevision, effectiveDate: effectiveDate))
            if let error { throw error }
            return .init(status: "paused", protocolId: protocolId, executionId: "execution-peptide", executionRevision: expectedRevision + 1, priorityId: "reminder-peptide", lifecycle: nil)
        }

        func resume(protocolId: String, expectedRevision: Int) async throws -> PeptideLifecycleChangeResult {
            resumes.append(.init(protocolId: protocolId, expectedRevision: expectedRevision))
            if let error { throw error }
            return .init(status: "resumed", protocolId: protocolId, executionId: "execution-peptide", executionRevision: expectedRevision + 1, priorityId: "reminder-peptide", lifecycle: nil)
        }
    }

    private final class ReconcileCounter { var count = 0; var events: [String] = [] }

    // MARK: - Fixtures (synthetic values only)

    private func detail(
        revision: Int = 3,
        lifecycle: String? = #"{"state":"active","since":null,"history":[]}"#,
        currentDose: String? = #"{"amount":1.5,"unit":"mg"}"#,
        nextDueDate: String? = "2026-10-01",
        nextDueTime: String? = "21:45",
        plannedChanges: String = "[]",
        localDate: String? = "2026-09-29"
    ) throws -> PeptideSupportDetail {
        func quoted(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "null" }
        let json = """
        {"protocolId":"peptide-protocol","executionId":"execution-peptide","executionRevision":\(revision),"name":"Retatrutide","purpose":"Support the active body-composition strategy.","state":"CANONICAL","supportSchedule":{"frequency":"specific_days","daysOfWeek":["thursday"],"intervalDays":1,"timing":"specific","specificTime":"21:45","startDate":"2026-05-21","endDate":null},"dosing":{"pattern":"up_hold_down","startingDoseAmount":0.5,"startingDoseUnit":"mg","startDate":"2026-05-21","stepAmount":0.25,"stepInterval":1,"stepUnit":"weeks","targetDoseAmount":2,"holdDuration":4,"holdUnit":"weeks","decreaseAmount":0.25,"decreaseInterval":1,"decreaseUnit":"weeks","landingDoseAmount":1.5,"endDate":null},"timeline":[{"id":"execution-peptide:phase:1:2026-05-21","label":"Phase 1","window":"May 21, 2026 – Aug 5, 2026","doseAmount":0.5,"doseUnit":"mg","status":"completed"},{"id":"execution-peptide:phase:2:2026-08-06","label":"Phase 2","window":"Aug 6, 2026 – Until changed","doseAmount":1.5,"doseUnit":"mg","status":"active"}],"reminderPreference":"remind","timingContext":"fasted_before_bed","notes":"Current plan","nextDue":"Oct 1, 2026 · 9:45 PM","nextDueDate":\(quoted(nextDueDate)),"nextDueTime":\(quoted(nextDueTime)),"lifecycle":\(lifecycle ?? "null"),"currentDose":\(currentDose ?? "null"),"currentDoseLabel":\(currentDose == nil ? "null" : "\"1.5 mg\""),"currentPhase":{"startDate":"2026-08-06","endDate":null},"plannedChanges":\(plannedChanges),"dosingHistory":[{"startDate":"2026-05-21","endDate":"2026-08-05","dose":{"amount":0.5,"unit":"mg"},"label":"0.5 mg · May 21 – Aug 5"}],"dosingMode":"structured","advancedPlan":false,"priorityId":"reminder-peptide","localDate":\(quoted(localDate))}
        """
        return try JSONDecoder().decode(PeptideSupportDetail.self, from: Data(json.utf8))
    }

    private func problem(status: Int, code: String, title: String) throws -> ProductionProblemDetails {
        let json = #"{"problemVersion":"1","type":"about:blank","title":"\#(title)","status":\#(status),"code":"\#(code)","detail":null,"instance":null,"requestId":null,"fieldErrors":[],"recovery":null}"#
        return try JSONDecoder().decode(ProductionProblemDetails.self, from: Data(json.utf8))
    }

    private func makeModel(
        api: StubSupportAPI,
        lifecycle: StubLifecycleAPI = StubLifecycleAPI(),
        authority: NativeAPIEnvironment = .founderProduction,
        reconcile: ReconcileCounter = ReconcileCounter(),
        deviceToday: String = "2026-09-29"
    ) -> PeptideSupportEditorViewModel {
        PeptideSupportEditorViewModel(
            protocolId: "peptide-protocol",
            authority: authority,
            supportAPI: api,
            lifecycleAPI: lifecycle,
            store: OperatingPlanSandboxStore(),
            reconcileNotifications: { reconcile.count += 1; reconcile.events.append("reconcile") },
            withdrawOccurrenceNotifications: { reconcile.events.append("withdraw:\($0)") },
            deviceToday: { deviceToday }
        )
    }

    // MARK: - Change dose (S2)

    func testChangeDoseSendsStayFromTodayWithEverythingElseUnchanged() async throws {
        let original = try detail(revision: 3)
        let api = StubSupportAPI(fetchQueue: [original, try detail(revision: 4)])
        let reconcile = ReconcileCounter()
        let model = makeModel(api: api, reconcile: reconcile)
        await model.load()
        XCTAssertTrue(model.supportsSimpleEditor)
        XCTAssertEqual(model.detail?.executionRevision, 3)

        let saved = await model.changeDose(amount: 2.5, unit: "mg", effectiveDate: "2026-09-29")

        XCTAssertTrue(saved)
        XCTAssertNil(model.errorMessage)
        let call = try XCTUnwrap(api.saves.first)
        XCTAssertEqual(api.saves.count, 1)
        XCTAssertEqual(call.protocolId, "peptide-protocol")
        XCTAssertEqual(call.expectedRevision, 3, "If-Match carries the revision from the read")
        XCTAssertEqual(call.dosing.pattern, .stay)
        XCTAssertEqual(call.dosing.startingDoseAmount, 2.5)
        XCTAssertEqual(call.dosing.startingDoseUnit, "mg")
        XCTAssertEqual(call.dosing.startDate, "2026-09-29")
        XCTAssertNil(call.dosing.endDate)
        XCTAssertEqual(call.supportSchedule, original.supportSchedule, "Days/time ride along unchanged")
        XCTAssertEqual(call.reminderPreference, original.reminderPreference)
        XCTAssertEqual(call.notes, original.notes)
        XCTAssertEqual(call.timingContext, "fasted_before_bed")
        XCTAssertFalse(call.rewriteHistory, "The simple sheet never rewrites history")
        XCTAssertEqual(api.fetchCount, 2, "Every write re-fetches peptide-support")
        XCTAssertEqual(model.detail?.executionRevision, 4, "The revision comes from the read, never a local increment")
        XCTAssertEqual(reconcile.count, 1)
        XCTAssertFalse(model.isSaving)
    }

    func testChangeDoseRefusesAPastDateBeforeItReachesTheWire() async throws {
        let api = StubSupportAPI(fetchQueue: [try detail()])
        let model = makeModel(api: api)
        await model.load()

        let past = await model.changeDose(amount: 2.5, unit: "mg", effectiveDate: "2026-09-28")
        XCTAssertFalse(past)
        XCTAssertTrue(api.saves.isEmpty)
        XCTAssertEqual(model.errorMessage, PeptideSupportEditorViewModel.pastDateCopy)

        let future = await model.changeDose(amount: 2.5, unit: "mg", effectiveDate: "2026-10-08")
        XCTAssertTrue(future)
        XCTAssertEqual(api.saves.last?.dosing.startDate, "2026-10-08")
    }

    func testChangeDoseUsesTheServerLocalDateForTodayOverTheDevice() async throws {
        // The device thinks it is already the 30th; the Server's read says
        // the owner's day is still the 29th, so the 29th is "today".
        let api = StubSupportAPI(fetchQueue: [try detail(localDate: "2026-09-29")])
        let model = makeModel(api: api, deviceToday: "2026-09-30")
        await model.load()
        XCTAssertEqual(model.today, "2026-09-29")
        let outcome1 = await model.changeDose(amount: 1, unit: "mg", effectiveDate: "2026-09-29")
        XCTAssertTrue(outcome1)

        let legacy = StubSupportAPI(fetchQueue: [try detail(localDate: nil)])
        let fallback = makeModel(api: legacy, deviceToday: "2026-09-30")
        await fallback.load()
        XCTAssertEqual(fallback.today, "2026-09-30", "Without a Server local date the device date is the fallback")
    }

    // MARK: - Days / Time / Reminder / Notes never touch the dose plan

    func testDaysTimeReminderAndNotesKeepDosingUnchanged() async throws {
        let original = try detail()
        let api = StubSupportAPI(fetchQueue: [original])
        let model = makeModel(api: api)
        await model.load()

        let outcome2 = await model.changeDays(daysOfWeek: [.thursday, .sunday, .monday, .wednesday, .tuesday])
        XCTAssertTrue(outcome2)
        let outcome3 = await model.changeTime("20:30")
        XCTAssertTrue(outcome3)
        let outcome4 = await model.setReminder(false)
        XCTAssertTrue(outcome4)
        let outcome5 = await model.setNotes("Rotate injection sites.")
        XCTAssertTrue(outcome5)
        let outcome6 = await model.changeInterval(everyNDays: 3)
        XCTAssertTrue(outcome6)

        XCTAssertEqual(api.saves.count, 5)
        for call in api.saves {
            XCTAssertEqual(call.dosing, original.dosing, "Schedule edits ride supportSchedule/reminder/notes only")
            XCTAssertFalse(call.rewriteHistory)
            XCTAssertEqual(call.expectedRevision, 3)
        }
        XCTAssertEqual(api.saves[0].supportSchedule.frequency, .specificDays)
        XCTAssertEqual(api.saves[0].supportSchedule.daysOfWeek, [.sunday, .monday, .tuesday, .wednesday, .thursday], "Sunday-first order")
        XCTAssertEqual(api.saves[1].supportSchedule.timing, .specific)
        XCTAssertEqual(api.saves[1].supportSchedule.specificTime, "20:30")
        XCTAssertEqual(api.saves[2].reminderPreference, .none)
        XCTAssertEqual(api.saves[3].notes, "Rotate injection sites.")
        XCTAssertEqual(api.saves[4].supportSchedule.frequency, .everyXDays)
        XCTAssertEqual(api.saves[4].supportSchedule.intervalDays, 3)
        XCTAssertEqual(api.fetchCount, 6)
    }

    func testChangeDaysWithAllSevenDaysBecomesTheDailyCadence() async throws {
        let api = StubSupportAPI(fetchQueue: [try detail()])
        let model = makeModel(api: api)
        await model.load()
        let outcome7 = await model.changeDays(daysOfWeek: OperatingPlanWeekday.allCases)
        XCTAssertTrue(outcome7)
        XCTAssertEqual(api.saves.first?.supportSchedule.frequency, .daily)
        XCTAssertEqual(api.saves.first?.supportSchedule.daysOfWeek, [])

        let outcome8 = await model.changeDays(daysOfWeek: [])
        XCTAssertFalse(outcome8)
        XCTAssertEqual(api.saves.count, 1)
    }

    // MARK: - Pause / Resume (S3)

    func testPauseAndResumeCallTheLifecycleAPIWithIfMatchThenRefetch() async throws {
        let api = StubSupportAPI(fetchQueue: [
            try detail(revision: 3),
            try detail(revision: 4, lifecycle: #"{"state":"paused","since":"2026-09-30","history":[{"state":"paused","effectiveDate":"2026-09-30","at":"2026-09-29T20:00:00.000Z"}]}"#, nextDueDate: nil, nextDueTime: nil),
            try detail(revision: 5),
        ])
        let lifecycle = StubLifecycleAPI()
        let reconcile = ReconcileCounter()
        let model = makeModel(api: api, lifecycle: lifecycle, reconcile: reconcile)
        await model.load()

        let outcome9 = await model.pause(effectiveDate: .tomorrow)
        XCTAssertTrue(outcome9)
        XCTAssertEqual(lifecycle.pauses, [.init(protocolId: "peptide-protocol", expectedRevision: 3, effectiveDate: .tomorrow)])
        XCTAssertEqual(api.fetchCount, 2, "Pause re-reads peptide-support")
        XCTAssertEqual(model.detail?.executionRevision, 4)
        XCTAssertTrue(model.isPaused)
        XCTAssertEqual(model.nextDoseLabel, "Paused")
        XCTAssertEqual(model.pausedSinceLabel, "Sep 30")
        XCTAssertEqual(model.resultMessage, "Paused starting tomorrow.")
        XCTAssertEqual(reconcile.count, 1)
        XCTAssertTrue(api.saves.isEmpty, "Pause is a lifecycle command, not a save")

        let outcome10 = await model.resume()
        XCTAssertTrue(outcome10)
        XCTAssertEqual(lifecycle.resumes, [.init(protocolId: "peptide-protocol", expectedRevision: 4)], "Resume uses the revision from the re-read")
        XCTAssertEqual(api.fetchCount, 3)
        XCTAssertEqual(model.detail?.executionRevision, 5)
        XCTAssertFalse(model.isPaused)
        XCTAssertEqual(model.resultMessage, "Resumed. Next dose Thu, Oct 1 · 9:45 PM.")
        XCTAssertEqual(reconcile.count, 2)
    }

    func testPauseWithdrawsTheReminderNotificationsThenReconcilesAndResumeOnlyReconciles() async throws {
        let api = StubSupportAPI(fetchQueue: [
            try detail(revision: 3),
            try detail(revision: 4, lifecycle: #"{"state":"paused","since":"2026-09-29","history":[]}"#, nextDueDate: nil, nextDueTime: nil),
            try detail(revision: 5),
        ])
        let lifecycle = StubLifecycleAPI()
        let reconcile = ReconcileCounter()
        let model = makeModel(api: api, lifecycle: lifecycle, reconcile: reconcile)
        await model.load()

        let paused = await model.pause(effectiveDate: .today)
        XCTAssertTrue(paused)
        XCTAssertEqual(reconcile.events, ["withdraw:reminder-peptide", "reconcile"],
                       "Pending and delivered notifications are withdrawn with the lifecycle result's priorityId before the horizon is reconciled")

        let resumed = await model.resume()
        XCTAssertTrue(resumed)
        XCTAssertEqual(reconcile.events, ["withdraw:reminder-peptide", "reconcile", "reconcile"], "Resume never withdraws; the re-read horizon reschedules")

        // A refused pause withdraws nothing.
        let stale = try problem(status: 412, code: "STALE_VERSION", title: "The resource changed after it was loaded.")
        let refusedAPI = StubSupportAPI(fetchQueue: [try detail(revision: 3), try detail(revision: 6)])
        let refusedLifecycle = StubLifecycleAPI()
        refusedLifecycle.error = ProductionNativeError.failedPrecondition(stale)
        let refusedReconcile = ReconcileCounter()
        let refused = makeModel(api: refusedAPI, lifecycle: refusedLifecycle, reconcile: refusedReconcile)
        await refused.load()
        let outcome = await refused.pause(effectiveDate: .today)
        XCTAssertFalse(outcome)
        XCTAssertEqual(refusedReconcile.events, [])
    }

    func testPauseWithoutARevisionIsRefusedLocally() async throws {
        let json = try detail()
        var legacy = json
        legacy.executionRevision = nil
        let api = StubSupportAPI(fetchQueue: [legacy])
        let lifecycle = StubLifecycleAPI()
        let model = makeModel(api: api, lifecycle: lifecycle)
        await model.load()
        XCTAssertFalse(model.supportsSimpleEditor)
        let outcome11 = await model.pause(effectiveDate: .today)
        XCTAssertFalse(outcome11)
        XCTAssertTrue(lifecycle.pauses.isEmpty)
        XCTAssertNotNil(model.errorMessage)
    }

    // MARK: - Server refusals

    func testStaleRevisionRereadsAndExplains() async throws {
        let stale = try problem(status: 412, code: "STALE_VERSION", title: "The resource changed after it was loaded.")
        let api = StubSupportAPI(fetchQueue: [try detail(revision: 3), try detail(revision: 5)], saveResult: .failure(ProductionNativeError.failedPrecondition(stale)))
        let reconcile = ReconcileCounter()
        let model = makeModel(api: api, reconcile: reconcile)
        await model.load()

        let outcome12 = await model.setNotes("Edited on a stale screen")
        XCTAssertFalse(outcome12)
        XCTAssertEqual(api.fetchCount, 2, "412 re-reads before explaining")
        XCTAssertEqual(model.detail?.executionRevision, 5)
        XCTAssertEqual(model.errorMessage, "Retatrutide was updated elsewhere. We refreshed it; check the value and tap Save again.")
        XCTAssertEqual(reconcile.count, 0)
        XCTAssertFalse(model.isSaving)
    }

    func testStaleRevisionOnPauseRereadsToo() async throws {
        let stale = try problem(status: 412, code: "STALE_VERSION", title: "The resource changed after it was loaded.")
        let api = StubSupportAPI(fetchQueue: [try detail(revision: 3), try detail(revision: 6)])
        let lifecycle = StubLifecycleAPI()
        lifecycle.error = ProductionNativeError.failedPrecondition(stale)
        let model = makeModel(api: api, lifecycle: lifecycle)
        await model.load()
        let outcome13 = await model.pause(effectiveDate: .today)
        XCTAssertFalse(outcome13)
        XCTAssertEqual(api.fetchCount, 2)
        XCTAssertEqual(model.detail?.executionRevision, 6)
        XCTAssertEqual(model.errorMessage, PeptideSupportEditorViewModel.updatedElsewhereCopy(name: "Retatrutide"))
    }

    func testValidationProblemShowsTheServerTitleVerbatim() async throws {
        let invalid = try problem(status: 400, code: "PEPTIDE_SUPPORT_INVALID", title: "Enter a starting dose and unit.")
        let api = StubSupportAPI(fetchQueue: [try detail()], saveResult: .failure(ProductionNativeError.validation(invalid)))
        let model = makeModel(api: api)
        await model.load()
        let outcome14 = await model.changeTime("20:30")
        XCTAssertFalse(outcome14)
        XCTAssertEqual(model.errorMessage, "Enter a starting dose and unit.")
        XCTAssertEqual(api.fetchCount, 1, "A 400 does not re-read; the value stays open for correction")
    }

    func testUnchangedStatusCountsAsSuccess() async throws {
        let api = StubSupportAPI(
            fetchQueue: [try detail()],
            saveResult: .success(.init(status: "unchanged", protocolId: "peptide-protocol", executionId: "execution-peptide", executionRevision: 3))
        )
        let model = makeModel(api: api)
        await model.load()
        let outcome15 = await model.setNotes("Current plan")
        XCTAssertTrue(outcome15)
        XCTAssertNil(model.errorMessage)
        XCTAssertEqual(api.fetchCount, 2)
    }

    func testOtherFailuresKeepTheBuild69Copy() async throws {
        let api = StubSupportAPI(fetchQueue: [try detail()], saveResult: .failure(ProductionNativeError.invalidResponse))
        let model = makeModel(api: api)
        await model.load()
        let outcome16 = await model.setReminder(false)
        XCTAssertFalse(outcome16)
        XCTAssertEqual(model.errorMessage, PeptideSupportEditorViewModel.genericSaveFailureCopy)
    }

    // MARK: - Feature detection

    func testLegacyPayloadFallsBackToTheAdvancedEditor() async throws {
        let legacy = try detail(lifecycle: nil, currentDose: nil, nextDueDate: nil, nextDueTime: nil, localDate: nil)
        XCTAssertFalse(legacy.supportsSimpleEditor)
        XCTAssertFalse(legacy.isPaused)
        let api = StubSupportAPI(fetchQueue: [legacy])
        let model = makeModel(api: api)
        await model.load()
        XCTAssertFalse(model.supportsSimpleEditor)
        XCTAssertEqual(model.nextDoseLabel, "Oct 1, 2026 · 9:45 PM", "Only the Server's own string is available")
        XCTAssertEqual(model.doseLabel, "1.5 mg", "The active timeline phase is the last fallback")

        let noLifecycle = try detail(lifecycle: nil)
        XCTAssertFalse(noLifecycle.supportsSimpleEditor)
        let noDose = try detail(currentDose: nil)
        XCTAssertFalse(noDose.supportsSimpleEditor)
        XCTAssertTrue(try detail().supportsSimpleEditor)
    }

    // MARK: - Presentation

    func testCardRowsRenderTheDesignCopy() async throws {
        let api = StubSupportAPI(fetchQueue: [try detail(plannedChanges: #"[{"startDate":"2026-10-08","dose":{"amount":2.5,"unit":"mg"},"label":"Phase 3"},{"startDate":"2026-10-22","dose":{"amount":3,"unit":"mg"},"label":"Phase 4"}]"#)])
        let model = makeModel(api: api)
        await model.load()
        XCTAssertEqual(model.doseLabel, "1.5 mg")
        XCTAssertEqual(model.daysLabel, "Thursday")
        XCTAssertEqual(model.timeLabel, "9:45 PM")
        XCTAssertEqual(model.nextDoseLabel, "Thu, Oct 1 · 9:45 PM")
        XCTAssertNil(model.pausedSinceLabel)
        XCTAssertEqual(model.plannedChangeLabel, "2.5 mg on Oct 8")
        XCTAssertEqual(model.advancedSummary, "Increase, hold, then decrease · next change Oct 8")
        XCTAssertEqual(model.dosingHistoryLines, ["0.5 mg · May 21 – Aug 5"])
        XCTAssertEqual(
            model.changeDoseCaption(amount: 2, unit: "mg", effectiveDate: "2026-09-29"),
            "Your dose plan becomes a steady 2 mg from Sep 29. Doses already taken are kept. Planned changes on Oct 8 and Oct 22 will be removed."
        )
    }

    func testDaysFormatterFollowsTheCritiqueRules() {
        func schedule(_ frequency: SupportScheduleFrequency, _ days: [OperatingPlanWeekday] = [], interval: Int = 1) -> OperatingPlanSupportScheduleReadModel {
            .init(frequency: frequency, daysOfWeek: days, intervalDays: interval, timing: .evening, specificTime: "", startDate: "2026-05-21", endDate: nil)
        }
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.daily)), "Every day")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, OperatingPlanWeekday.allCases)), "Every day")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.thursday])), "Thursday")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.weekly, [.monday])), "Monday")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.thursday, .sunday, .wednesday, .monday, .tuesday])), "Sun–Thu")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.monday, .tuesday, .wednesday])), "Mon–Wed")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.monday, .thursday])), "Mon, Thu")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.monday, .tuesday])), "Mon, Tue", "Two consecutive days are listed, not ranged")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.saturday, .sunday])), "Sun, Sat", "No wrap-around ranges")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.everyXDays, interval: 3)), "Every 3 days")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.everyXDays, interval: 2)), "Every other day")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.everyXDays, interval: 1)), "Every day")
    }

    func testNextDoseFormatterUsesTodayTomorrowThenWeekday() {
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2026-09-29", time: "21:45", today: "2026-09-29"), "Today · 9:45 PM")
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2026-09-30", time: "21:45", today: "2026-09-29"), "Tomorrow · 9:45 PM")
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2026-10-01", time: "21:45", today: "2026-09-29"), "Thu, Oct 1 · 9:45 PM")
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2026-10-01", time: "09:05", today: "2026-09-29"), "Thu, Oct 1 · 9:05 AM")
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2027-01-01", time: nil, today: "2026-12-31"), "Tomorrow", "Year boundary")
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2026-10-05", time: nil, today: "2026-09-29"), "Mon, Oct 5")
        XCTAssertNil(PeptideSupportPresentation.formatNextDose(date: nil, time: "21:45", today: "2026-09-29"))
    }

    func testDoseLabelTrimsTrailingZeros() {
        XCTAssertEqual(PeptideSupportPresentation.formatDoseAmount(2.5), "2.5")
        XCTAssertEqual(PeptideSupportPresentation.formatDoseAmount(2.50), "2.5")
        XCTAssertEqual(PeptideSupportPresentation.formatDoseAmount(3), "3")
        XCTAssertEqual(PeptideSupportPresentation.formatDoseAmount(0.125), "0.125")
        XCTAssertEqual(PeptideSupportPresentation.formatDoseAmount(0.5), "0.5")
        XCTAssertEqual(PeptideSupportPresentation.formatDose(2.5, "mg"), "2.5 mg")
        XCTAssertEqual(PeptideSupportPresentation.formatDose(2.5, " "), "2.5")
    }

    // MARK: - Sandbox parity

    func testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture() async throws {
        let store = OperatingPlanSandboxStore()
        let reconcile = ReconcileCounter()
        let model = PeptideSupportEditorViewModel(
            protocolId: "protocol_fixture_peptide_retatrutide",
            authority: .sandbox,
            supportAPI: NotAvailablePeptideSupportAPI(),
            lifecycleAPI: NotAvailablePeptideLifecycleAPI(),
            store: store,
            reconcileNotifications: { reconcile.count += 1 },
            deviceToday: { "2026-09-29" }
        )
        await model.load()
        XCTAssertTrue(model.supportsSimpleEditor, "The fixture carries lifecycle, currentDose and a revision")
        XCTAssertEqual(model.doseLabel, "3 mg")
        XCTAssertEqual(model.plannedChangeLabel, "3.5 mg on Oct 13")
        let before = try XCTUnwrap(store.peptideExecution(protocolId: "protocol_fixture_peptide_retatrutide"))

        let outcome17 = await model.changeDose(amount: 4, unit: "mg", effectiveDate: "2026-09-01")
        XCTAssertFalse(outcome17, "Past dates are refused in the sandbox too")
        let outcome18 = await model.changeDose(amount: 4, unit: "mg", effectiveDate: "2026-10-01")
        XCTAssertTrue(outcome18)
        let after = try XCTUnwrap(model.detail)
        XCTAssertEqual(after.executionRevision, (before.executionRevision ?? 0) + 1)
        XCTAssertEqual(after.timeline.count, 4, "Three frozen phases plus the new steady one; the Oct 13 change is gone")
        XCTAssertEqual(after.timeline.prefix(2).map(\.doseAmount), before.timeline.prefix(2).map(\.doseAmount))
        XCTAssertEqual(after.timeline[2].endDate, "2026-09-30", "The containing phase closes the day before")
        XCTAssertEqual(after.timeline.last?.startDate, "2026-10-01")
        XCTAssertEqual(after.timeline.last?.doseAmount, 4)
        XCTAssertEqual(after.dosing.pattern, .stay)
        XCTAssertEqual(reconcile.count, 0, "Sandbox never reconciles production notifications")

        let outcome19 = await model.pause(effectiveDate: .today)
        XCTAssertTrue(outcome19)
        XCTAssertTrue(model.isPaused)
        XCTAssertEqual(model.nextDoseLabel, "Paused")
        XCTAssertNotNil(model.pausedSinceLabel)
        let outcome20 = await model.resume()
        XCTAssertTrue(outcome20)
        XCTAssertFalse(model.isPaused)
        XCTAssertEqual(model.detail?.executionRevision, (before.executionRevision ?? 0) + 3)
    }
}
