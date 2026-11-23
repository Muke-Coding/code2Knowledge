package com.code2knowledge.runtime.service;

import com.code2knowledge.authorization.constant.PermissionCodes;

import com.code2knowledge.runtime.mapper.RuntimeMapper;
import com.code2knowledge.runtime.domain.entity.*;
import com.code2knowledge.runtime.domain.dto.RedeemDTO;
import com.code2knowledge.runtime.domain.vo.*;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.common.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;
import java.util.Base64;
import java.time.Instant;
import java.security.*;
import java.nio.charset.StandardCharsets;

/**
 * 私有设备接入服务，不执行仓库或模型任务；配对、消费、心跳、撤销与审计在数据库事务内。
 * 锁顺序统一账户→配对/设备，启停、重放与撤销串行；凭证高熵随机，仅保存SHA256摘要，无共享和消息投递。
 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class RuntimeService {
    /** 设备SQL入口，所有权在XML和服务双重检查。 */
    private final RuntimeMapper mapper;
    /** 任务协议按企业→账户→设备加锁，与浏览器授权写入保持顺序；心跳不反向获取企业锁。 */
    private final com.code2knowledge.authorization.mapper.AuthorizationMapper authorization;
    /** 可信浏览器身份入口。 */
    private final IdentityService identity;
    /** 账户锁、当前认证版本和审计入口。 */
    private final IdentityMapper accounts;
    /** 服务端密码学随机源，不使用可预测业务ID作为凭证。 */
    private final SecureRandom random = new SecureRandom();
    /**
     * 创建5分钟单次码；账户锁串行创建，只保留该成员最新待兑换码，原值仅本次返回。
     *
     * @return 新配对资料，不为空
     *
     * @throws ApiException 身份失效或禁用时401
     */
    @Transactional
    public PairingVO pair() {
        AccountDO actor = identity.require(PermissionCodes.DEVICE_PAIR);
        AccountDO locked = activeOwner(actor.getId(), actor.getAuthVersion());
        String code = secret(); String id = UUID.randomUUID().toString();
        Instant expires = Instant.now().plusSeconds(300);
        PairingDO pairing = new PairingDO(); pairing.setId(id); pairing.setTenantId(locked.getTenantId()); pairing.setOwnerId(locked.getId()); pairing.setOwnerVersion(locked.getAuthVersion()); pairing.setCodeHash(hash(code));
        mapper.invalidatePairings(locked.getTenantId(), locked.getId()); mapper.insertPairing(pairing, expires.toString());
        accounts.audit(locked.getTenantId(), locked.getId(), "runtime.pairing.created", id);
        return new PairingVO(id, code, expires.toString());
    }
    /**
     * 兑换设备专用凭证；码单次消费和设备插入原子提交，响应丢失需用户新配对，不重放原凭证。
     *
     * @param input 码和自报设备元数据，不为空，version必须1
     *
     * @return 30天设备凭证，仅本次返回设备，不为空
     *
     * @throws ApiException 码无效/过期/消费或所有者失效返回401；协议不支持409；字段不合法400
     */
    @Transactional
    public DeviceCredentialVO redeem(RedeemDTO input) {
        if (!"1".equals(input.getVersion())) throw new ApiException(409, "PROTOCOL_UNSUPPORTED", "运行时协议不受支持，请升级客户端");
        String codeHash = hashChecked(input.getCode());
        String name = IdentityService.text(input.getName(), 80, "设备名称");
        String os = label(input.getOs()); String arch = label(input.getArch());
        PairingDO observed = mapper.findPairing(codeHash);
        if (observed == null) throw invalid();
        authorization.lockTenant(observed.getTenantId());
        AccountDO owner = activeOwner(observed.getOwnerId(), observed.getOwnerVersion());
        if (!authorization.effective(owner.getTenantId(), owner.getId()).contains(PermissionCodes.DEVICE_PAIR)) throw invalid();
        PairingDO pairing = mapper.lockPairing(codeHash);
        if (pairing == null || mapper.consume(pairing.getId()) != 1) throw invalid();
        String token = secret(); Instant expires = Instant.now().plusSeconds(2592000);
        DeviceDO device = new DeviceDO(); device.setId(UUID.randomUUID().toString()); device.setTenantId(owner.getTenantId()); device.setOwnerId(owner.getId()); device.setOwnerVersion(owner.getAuthVersion()); device.setName(name); device.setOs(os); device.setArch(arch); device.setVersion("1"); device.setTokenHash(hash(token));
        mapper.insertDevice(device, expires.toString()); accounts.audit(owner.getTenantId(), owner.getId(), "runtime.paired", device.getId());
        return new DeviceCredentialVO(device.getId(), token, expires.toString());
    }
    /**
     * 认证设备后记录服务端时间；设备凭证不能成为浏览器用户或取得目录/知识权限。
     *
     * @param authorization Bearer专用设备凭证，不允许Cookie替代，不为空
     *
     * @return 心跳确认，不为空
     *
     * @throws ApiException 凭证、所有者版本、过期或撤销不合法时统一401
     */
    @Transactional
    public HeartbeatVO heartbeat(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) throw invalid();
        String digest = hashChecked(authorization.substring(7));
        DeviceDO observed = mapper.findCredential(digest); if (observed == null) throw invalid();
        activeOwner(observed.getOwnerId(), observed.getOwnerVersion());
        DeviceDO device = mapper.lockCredential(digest); if (device == null) throw invalid();
        mapper.heartbeat(device.getId());
        return new HeartbeatVO(device.getId(), "ONLINE", Instant.now().toString());
    }
    /**
     * 任务协议认证并持锁，调用方必须有事务；不同于心跳，先锁企业使来源撤权与任务结果提交串行。
     *
     * @param header 专用Bearer设备凭证，禁止Cookie替代，不可为空
     *
     * @return 当前有效私有设备，包含服务内部摘要，禁止直接序列化
     *
     * @throws ApiException 设备/账户失效401；调用方缺少事务时拒绝
     */
    public DeviceDO taskDevice(String header) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("任务认证必须在事务内");
        if (header == null || !header.startsWith("Bearer ")) throw invalid();
        String digest = hashChecked(header.substring(7));
        DeviceDO observed = mapper.findCredential(digest); if (observed == null) throw invalid();
        authorization.lockTenant(observed.getTenantId());
        activeOwner(observed.getOwnerId(), observed.getOwnerVersion());
        DeviceDO current = mapper.lockCredential(digest); if (current == null) throw invalid();
        return current;
    }
    /** @return 当前成员私有设备，不含凭证，管理员也不能列其他成员设备 */
    public List<DeviceVO> list() { AccountDO actor = identity.require(PermissionCodes.DEVICE_READ); return mapper.list(actor.getTenantId(), actor.getId()); }
    /**
     * 所有者不可逆撤销设备，重复调用幂等；账户先锁，设备再锁，阻止旧心跳在撤销后恢复在线。
     *
     * @param id 当前所有者设备UUID，不为空
     *
     * @throws ApiException 无权或不存在统一404；身份失效401
     */
    @Transactional
    public void revoke(String id) {
        AccountDO actor = identity.require(PermissionCodes.DEVICE_REVOKE); activeOwner(actor.getId(), actor.getAuthVersion());
        DeviceDO device = mapper.lockOwned(actor.getTenantId(), actor.getId(), id);
        if (device == null) throw new ApiException(404, "NOT_FOUND", "设备不存在或无访问权限");
        if (mapper.revoke(id) > 0) accounts.audit(actor.getTenantId(), actor.getId(), "runtime.revoked", id);
    }
    /**
     * 在账户锁内核对当前启用和认证版本，禁用再启用不恢复旧配对码或设备凭证。
     *
     * @param id 可信数据库所有者UUID，不为空
     *
     * @param version 配对/认证时版本，非负
     *
     * @return 当前有效账户，持有行锁到事务结束，不为空
     *
     * @throws ApiException 所有者失效时统一401
     */
    private AccountDO activeOwner(String id, int version) {
        AccountDO owner = accounts.lockById(id);
        if (owner == null || !owner.isEnabled() || owner.getAuthVersion() != version) throw invalid();
        return owner;
    }
    /** @return 256位随机base64url凭证，不为空且不输出日志 */
    private String secret() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    /**
     * @param value 待校验随机码，不可为空
     * @return SHA256摘要，不为空
     * @throws ApiException 格式无效统一401 */
    private static String hashChecked(String value) { if (value == null || !value.matches("[A-Za-z0-9_-]{43}")) throw invalid(); return hash(value); }
    /**
     * 对高熵凭证求摘要，不用于密码编码；32随机字节使离线猜测不可行。
     *
     * @param value 服务端生成的随机凭证，不为空
     *
     * @return 小写64位十六进制摘要，不为空
     *
     * @throws IllegalStateException JVM缺失标准SHA256时拒绝服务，不降级明文
     */
    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(); for (byte item : digest) result.append(String.format("%02x", item & 255)); return result.toString();
        } catch (NoSuchAlgorithmException error) { throw new IllegalStateException("标准摘要算法不可用"); }
    }
    /**
     * @param value 自报ASCII标识，不为空
     * @return 合法标识，不为空
     * @throws ApiException 非法字符或长度时400 */
    private static String label(String value) { if (value == null || !value.matches("[A-Za-z0-9._-]{1,32}")) throw new ApiException(400, "INVALID_DEVICE", "设备信息不合法"); return value; }
    /** @return 不区分不存在、过期、已消费和撤销的安全错误，不泄漏身份 */
    private static ApiException invalid() { return new ApiException(401, "DEVICE_UNAUTHORIZED", "配对或设备凭证无效，请在平台重新配对"); }
}
