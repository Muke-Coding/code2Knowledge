package com.code2knowledge.candidate.service;

import java.io.IOException;

/** 候选原包不可变对象端口；业务仅持有平台生成键，不依赖本地路径或未来S3 SDK，调用方负责权限与摘要。 */
public interface CandidateObjectStore {
    /**
     * @param tenant 已认证企业UUID
     * @param id 本次新候选UUID
     * @param bytes 非空且最多8MiB的原包
     * @throws IOException 写入失败；已有键必须抛FileAlreadyExistsException，调用方不得补偿删除旧键 */
    void put(String tenant, String id, byte[] bytes) throws IOException;
    /**
     * @param tenant 已授权企业UUID
     * @param id 已授权候选UUID
     * @return 最多8MiB原始ZIP，不可用不得伪造空内容
     * @throws IOException 对象不存在、损坏或不可读 */
    byte[] get(String tenant, String id) throws IOException;
    /**
     * @param tenant 本次新建企业UUID
     * @param id 本次未提交候选UUID
     * @throws IOException 补偿失败；只能删除本次未提交键 */
    void discard(String tenant, String id) throws IOException;
}
