package com.code2knowledge.review.controller;

import com.code2knowledge.review.service.ReviewService;
import com.code2knowledge.review.service.ReviewContentService;
import com.code2knowledge.review.domain.dto.SubmitReviewDTO;
import com.code2knowledge.review.domain.dto.DecideReviewDTO;
import com.code2knowledge.review.domain.vo.ReviewVO;
import com.code2knowledge.review.domain.vo.ReviewPageVO;
import com.code2knowledge.review.domain.vo.ReviewerVO;
import com.code2knowledge.candidate.domain.vo.CandidateContentVO;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** 审核HTTP边界；可信Cookie会话，写请求必须CSRF；无发布或原包改写，管理员无内容例外。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1/reviews")
public class ReviewController {
    /** 短事务送审/决定应用服务。 */
    private final ReviewService service;
    /** 对象读取在事务外执行。 */
    private final ReviewContentService content;
    /**
     *
     * @param page 从1开始
     *
     * @return 本人当前可见分页；401身份/403动作/400参数，无内容写入
     */
    @GetMapping
    public ReviewPageVO list(@RequestParam(defaultValue = "1") int page) { return service.list(page); }
    /**
     *
     * @param input 本人候选及显式审核人
     *
     * @return 201幂等审核；CSRF/source.analyze/全部来源，400参数/404审核人/409在途，保存记录与审计
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewVO submit(@RequestBody SubmitReviewDTO input) { return service.submit(input); }
    /**
     *
     * @param candidateId 本人候选
     *
     * @param keyword 姓名搜索
     *
     * @param page 从1开始
     *
     * @return 最多20个审核人摘要，可包含本人；401/403/404/400，不授予权限
     */
    @GetMapping("/reviewers")
    public List<ReviewerVO> reviewers(@RequestParam String candidateId, @RequestParam(defaultValue = "") String keyword, @RequestParam(defaultValue = "1") int page) { return service.reviewers(candidateId, keyword, page); }
    /**
     *
     * @param id 审核UUID
     *
     * @return 当前快照；提交者或受派人且全部来源当前有效，否则404，401/403身份动作，无写入
     */
    @GetMapping("/{id}")
    public ReviewVO get(@PathVariable String id) { return service.get(id); }
    /**
     *
     * @param id 审核UUID
     *
     * @param input 当前revision/决定/意见
     *
     * @return 确认或驳回；CSRF、实际受派review.decide及全部来源，400/403/404/409，写决定及审计，不发布
     */
    @PostMapping("/{id}/decide")
    public ReviewVO decide(@PathVariable String id, @RequestBody DecideReviewDTO input) { return service.decide(id, input); }
    /**
     *
     * @param id 当前可读审核
     *
     * @return 资产清单，Cookie/当前所有来源，不需GET CSRF；无权404
     *
     * @throws Exception 清单损坏
     */
    @GetMapping("/{id}/report")
    public JsonNode report(@PathVariable String id) throws Exception { return content.report(id); }
    /**
     *
     * @param id 审核UUID
     *
     * @param path 资产精确相对路径
     *
     * @return UTF8纯文本封套；Cookie/当前所有来源，404对象/503原包，无写入
     *
     * @throws Exception IO或完整性失败
     */
    @GetMapping("/{id}/content")
    public CandidateContentVO read(@PathVariable String id, @RequestParam String path) throws Exception { return content.read(id, path); }
}
