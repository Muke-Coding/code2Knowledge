package com.code2knowledge.candidate.service;

import com.code2knowledge.candidate.domain.entity.CandidateDO;
import com.code2knowledge.candidate.domain.vo.CandidateContentVO;
import com.code2knowledge.common.exception.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.Enumeration;
import org.apache.commons.compress.utils.SeekableInMemoryByteChannel;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CodingErrorAction;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import org.apache.commons.compress.archivers.zip.ZipFile;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;

/** 不可变原包文本读取器；无数据库事务/解包落盘/HTML执行，调用方须在IO前后重新授权。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class CandidateContentService {
    /** 原包私有对象端口，不返回公开URL。 */
    private final CandidateObjectStore objects;
    /** 原清单结构化解析，不以HTTP路径直接定位本机文件。 */
    private final ObjectMapper json;
    /**
     *
     * @param candidate 已经授权的内部引用
     *
     * @param path 清单中精确相对路径
     *
     * @return 校验后UTF8正文，不含附加文件
     *
     * @throws Exception 对象不可用/完整性失败503，未知资产404；调用者IO后仍需重查权限
     */
    public CandidateContentVO read(CandidateDO candidate, String path) throws Exception {
        JsonNode expected = null;
        for (JsonNode asset : json.readTree(candidate.getReport()).path("assets")) if (asset.path("path").asText().equals(path)) expected = asset;
        if (expected == null) throw new ApiException(404, "NOT_FOUND", "资产不存在或不可读");
        byte[] archive;
        try { archive = objects.get(candidate.getTenantId(), candidate.getId()); } catch (Exception error) { throw unavailable(); }
        if (archive.length > 8388608 || !hash(archive).equals(candidate.getArchiveSha256())) throw unavailable();
        int entries = 0, total = 0; byte[] selected = null;
        // 与接收端yauzl同读中央目录：bit11优先UTF8，否则CP437，并验证Unicode path extra；内存通道不落盘。
        try (ZipFile zip = ZipFile.builder().setSeekableByteChannel(new SeekableInMemoryByteChannel(archive)).setCharset(Charset.forName("Cp437")).setUseUnicodeExtraFields(true).get()) {
            Enumeration<ZipArchiveEntry> assets = zip.getEntries(); byte[] buffer = new byte[8192];
            while (assets.hasMoreElements()) {
                ZipArchiveEntry entry = assets.nextElement();
                if (++entries > 256) throw unavailable(); ByteArrayOutputStream output = new ByteArrayOutputStream(); int count;
                try (InputStream input = zip.getInputStream(entry)) {
                    while ((count = input.read(buffer)) != -1) { total += count; if (output.size() + count > 524288 || total > 4194304) throw unavailable(); output.write(buffer, 0, count); }
                }
                if (entry.getName().equals(path)) { if (selected != null || entry.isDirectory()) throw unavailable(); selected = output.toByteArray(); }
            }
        } catch (Exception error) { throw unavailable(); }
        if (selected == null || selected.length != expected.path("bytes").asInt() || !hash(selected).equals(expected.path("sha256").asText())) throw unavailable();
        String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(selected)).toString();
        return new CandidateContentVO(path, hash(selected), text);
    }
    /**
     *
     * @param bytes 原始字节
     *
     * @return 小写SHA256，不代替授权
     *
     * @throws Exception JVM缺少标准算法
     */
    private String hash(byte[] bytes) throws Exception { StringBuilder value = new StringBuilder(); for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format("%02x", item & 255)); return value.toString(); }
    /**
     * @return 固定安全错误，不暴露原文或对象路径
     */
    private ApiException unavailable() { return new ApiException(503, "ARTIFACT_UNAVAILABLE", "候选内容暂不可读取或完整性检查失败"); }
}
