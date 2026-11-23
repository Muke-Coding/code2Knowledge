package com.code2knowledge.review.service;

import com.code2knowledge.candidate.service.CandidateContentService;
import com.code2knowledge.candidate.domain.entity.CandidateDO;
import com.code2knowledge.candidate.domain.vo.CandidateContentVO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import lombok.RequiredArgsConstructor;

/** 审核内容非事务协调器；对象IO不持企业锁，返回前重新检查当前审核与所有来源权限。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class ReviewContentService {
    /** Spring代理短事务授权。 */
    private final ReviewService access;
    /** 固定原包读取与逐资产摘要校验。 */
    private final CandidateContentService content;
    /** 不可变清单解析。 */
    private final ObjectMapper json;
    /**
     *
     * @param id 审核UUID
     *
     * @return 当前可见清单
     *
     * @throws Exception 无权404或历史清单损坏
     */
    public JsonNode report(String id) throws Exception { return json.readTree(access.readable(id).getReport()); }
    /**
     *
     * @param id 审核UUID
     *
     * @param path 清单中的资产相对路径
     *
     * @return 重新授权的纯文本
     *
     * @throws Exception 无权404、原包异常503；不授予所有者导出权
     */
    public CandidateContentVO read(String id, String path) throws Exception { CandidateDO candidate = access.readable(id); CandidateContentVO result = content.read(candidate, path); access.readable(id); return result; }
}
